import { afterAll, describe, expect, it } from 'vitest';
import { buildServer } from './server';

describe('GET /healthz', () => {
  const app = buildServer();
  afterAll(() => app.close());

  it('answers ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('returns 404 for an unknown route', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(404);
  });
});
