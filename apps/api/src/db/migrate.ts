import { migrations } from './migrations';
import type { Db } from './pool';
import { withTransaction } from './pool';

const MIGRATION_LOCK = 7_231_990; // any constant; serialises concurrent cold starts

/**
 * Applies every migration not applied yet, in order, in one transaction. A transaction-level
 * advisory lock makes concurrent starts (several serverless instances) wait for each other
 * instead of racing on the same migration.
 */
export async function migrate(db: Db): Promise<string[]> {
  return withTransaction(db, async (client) => {
    await client.query('select pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
    await client.query(
      'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
    );
    const applied = new Set(
      (await client.query<{ name: string }>('select name from schema_migrations')).rows.map(
        (row) => row.name,
      ),
    );
    const ran: string[] = [];
    for (const { name, sql } of migrations) {
      if (applied.has(name)) continue;
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [name]);
      ran.push(name);
    }
    return ran;
  });
}
