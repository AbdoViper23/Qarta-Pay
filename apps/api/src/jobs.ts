import { randomUUID } from 'node:crypto';
import type { Db } from './db/pool';
import type { Logger } from './log';

/**
 * Background jobs without a background process (serverless hosting, docs/13-RUNBOOK.md §3).
 *
 * On Vercel nothing runs between requests, so the indexer, the fulfilment worker and the
 * housekeeping run when the site is used (each GET kicks a run, at most every few seconds per
 * instance) and when a cron calls GET /v1/jobs/run. A lease row in `job_lease` lets only one
 * runner work at a time across all instances, so two fulfiller transactions never race for
 * a nonce. The worker's own per-order leases still guard every order.
 */

export interface JobsResult {
  ran: boolean;
  events?: number;
  orders?: number;
  housekeeping?: boolean;
}

/** Takes the named lease for `seconds` if nobody holds it. Returns whether we got it. */
export async function acquireLease(
  db: Db,
  name: string,
  holder: string,
  seconds: number,
): Promise<boolean> {
  const result = await db.query(
    `insert into job_lease (name, holder, expires_at) values ($1, $2, now() + make_interval(secs => $3))
     on conflict (name) do update set holder = excluded.holder, expires_at = excluded.expires_at
       where job_lease.expires_at <= now()
     returning holder`,
    [name, holder, seconds],
  );
  return result.rowCount === 1;
}

export async function releaseLease(db: Db, name: string, holder: string): Promise<void> {
  await db.query('update job_lease set expires_at = now() where name = $1 and holder = $2', [
    name,
    holder,
  ]);
}

export interface JobRunnerDeps {
  db: Db;
  indexer: { tick: () => Promise<number> };
  worker: { tick: () => Promise<number> };
  housekeeping: () => Promise<void>;
  log: Logger;
}

export interface JobRunnerOptions {
  /** Longer than the host's maximum function duration, so a killed run cannot overlap. */
  leaseSeconds: number;
  housekeepingEverySeconds: number;
  /** Per-instance gap between two request-triggered runs. */
  minGapMs: number;
}

export const SERVERLESS_JOBS: JobRunnerOptions = {
  leaseSeconds: 310, // Vercel Hobby maxDuration is 300 s
  housekeepingEverySeconds: 60,
  minGapMs: 4000,
};

export function createJobRunner(deps: JobRunnerDeps, options: JobRunnerOptions = SERVERLESS_JOBS) {
  let lastKick = 0;
  let running: Promise<JobsResult> | null = null;

  /** One pass: index new events, move orders forward, housekeeping once a minute. */
  async function run(): Promise<JobsResult> {
    const holder = randomUUID();
    if (!(await acquireLease(deps.db, 'jobs', holder, options.leaseSeconds))) return { ran: false };
    try {
      const events = await deps.indexer.tick();
      const orders = await deps.worker.tick();
      // Not released on purpose: its expiry is the interval between two housekeeping runs.
      const housekeeping = await acquireLease(
        deps.db,
        'housekeeping',
        holder,
        options.housekeepingEverySeconds,
      );
      if (housekeeping) await deps.housekeeping();
      return { ran: true, events, orders, housekeeping };
    } finally {
      await releaseLease(deps.db, 'jobs', holder);
    }
  }

  /** Starts a run unless one is in flight here or one started moments ago. Never throws. */
  function kick(): Promise<JobsResult> | null {
    if (running || Date.now() - lastKick < options.minGapMs) return null;
    lastKick = Date.now();
    running = run()
      .catch((error: unknown) => {
        deps.log.error({ err: error }, 'background jobs failed');
        return { ran: false };
      })
      .finally(() => {
        running = null;
      });
    return running;
  }

  return { run, kick };
}

export type JobRunner = ReturnType<typeof createJobRunner>;
