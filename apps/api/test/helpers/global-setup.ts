import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import type { TestProject } from 'vitest/node';

/**
 * Starts one throw-away PostgreSQL for the whole test run (no Docker or system Postgres needed).
 * Each test file creates its own database in it (see db.ts).
 */
export default async function setup(project: TestProject) {
  const dir = mkdtempSync(join(tmpdir(), 'qarta-pg-'));
  const port = 55_000 + Math.floor(Math.random() * 5_000);
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'qarta',
    password: 'qarta',
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  project.provide('pgAdminUrl', `postgresql://qarta:qarta@127.0.0.1:${port}/postgres`);
  return async () => {
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
  }
}
