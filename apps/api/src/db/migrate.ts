import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './pool';
import { withTransaction } from './pool';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Applies every migrations/*.sql file not applied yet, in file-name order, each in a transaction. */
export async function migrate(db: Db): Promise<string[]> {
  await db.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const applied = new Set(
    (await db.query<{ name: string }>('select name from schema_migrations')).rows.map(
      (row) => row.name,
    ),
  );
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    await withTransaction(db, async (client) => {
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
    });
    ran.push(file);
  }
  return ran;
}
