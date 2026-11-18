/**
 * Local PostgreSQL without Docker: an embedded server whose data lives in apps/api/.data/pg
 * (git-ignored). Prints the DATABASE_URL and keeps running until Ctrl+C.
 *   pnpm --filter api db:dev
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '.data', 'pg');
const port = Number(process.env.DEV_DB_PORT ?? 54320);
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'qarta',
  password: 'qarta',
  port,
  persistent: true,
  onLog: () => {},
});
if (!existsSync(join(dir, 'PG_VERSION'))) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('qarta');
} catch {
  // already exists
}
console.log(`DATABASE_URL=postgresql://qarta:qarta@127.0.0.1:${port}/qarta`);
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
