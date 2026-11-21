import pg from 'pg';

// numeric(78,0) comes back as a string; turn it into bigint at the edge so no float sneaks in.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => value);
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => BigInt(value));

export type Db = pg.Pool;
export type DbClient = pg.PoolClient | pg.Pool;

/** `max` stays small on serverless hosts, where every instance opens its own pool. */
export function createPool(connectionString: string, max = 10): Db {
  return new pg.Pool({ connectionString, max });
}

/** Runs `fn` in one transaction; rolls back on any error. */
export async function withTransaction<T>(
  db: Db,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
