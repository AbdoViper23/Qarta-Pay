import type { IncomingMessage, ServerResponse } from 'node:http';
import { waitUntil } from '@vercel/functions';
import { loadConfig } from './config';
import { createLogger } from './log';
import { createRuntime } from './runtime';
import { FakeSupplier } from './supplier/fake';

/**
 * Vercel entry (vercel.json, service "api"). Vercel forwards /api/* here with the prefix kept.
 *
 * There are no loops on Vercel: each GET response kicks one pass of the indexer and worker
 * (kept alive with waitUntil), and a cron calls GET /api/v1/jobs/run as a fallback
 * (src/jobs.ts). For a long-running host use src/main.ts instead.
 */
const config = loadConfig();
const log = createLogger(config.LOG_LEVEL);
const runtime = await createRuntime(config, log, {
  ...(process.env.SUPPLIER === 'fake' ? { supplier: new FakeSupplier() } : {}),
  serverless: { basePath: '/api', background: (task) => waitUntil(task) },
});
await runtime.server.ready();

export default function handler(request: IncomingMessage, response: ServerResponse): void {
  runtime.server.server.emit('request', request, response);
}
