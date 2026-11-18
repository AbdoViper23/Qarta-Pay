import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { migrate } from '../../src/db/migrate';
import { createPool, type Db } from '../../src/db/pool';

/** A fresh, migrated database for one test file. */
export async function freshDatabase(): Promise<{ db: Db; url: string }> {
  const admin = inject('pgAdminUrl');
  const name = `t_${randomBytes(6).toString('hex')}`;
  const client = new pg.Client({ connectionString: admin });
  await client.connect();
  await client.query(`create database ${name}`);
  await client.end();
  const url = admin.replace(/\/postgres$/, `/${name}`);
  const db = createPool(url);
  await migrate(db);
  return { db, url };
}
