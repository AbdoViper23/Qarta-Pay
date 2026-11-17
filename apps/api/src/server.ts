import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Builds the HTTP server. Step 1 ships only the liveness route; the v1 API, the indexer
 * and the fulfilment worker arrive in Step 3 (docs/05-BACKEND.md).
 */
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/healthz', async () => ({ status: 'ok' }));

  return app;
}
