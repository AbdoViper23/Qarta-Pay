import { loadConfig } from './config';
import { createLogger } from './log';
import { createRuntime, loop } from './runtime';
import { FakeSupplier } from './supplier/fake';

/**
 * One process: HTTP API + indexer + fulfilment worker + housekeeping (docs/03-ARCHITECTURE.md).
 * SUPPLIER=fake runs the full flow without Reloadly credentials (refused on mainnet).
 */
const config = loadConfig();
const log = createLogger(config.LOG_LEVEL);
const runtime = await createRuntime(
  config,
  log,
  process.env.SUPPLIER === 'fake' ? { supplier: new FakeSupplier() } : {},
);

const stops = [
  loop('indexer', config.INDEXER_POLL_MS, () => runtime.indexer.tick(), log),
  loop('worker', config.WORKER_POLL_MS, () => runtime.worker.tick(), log),
  loop('housekeeping', 60_000, () => runtime.housekeeping(), log),
];

await runtime.server.listen({ port: config.PORT, host: '0.0.0.0' });
log.info(
  {
    port: config.PORT,
    chainId: config.CHAIN_ID,
    checkout: config.addresses.checkout,
    supplier: runtime.supplier.name,
  },
  'qarta api started',
);

const shutdown = async () => {
  stops.forEach((stop) => stop());
  await runtime.server.close();
  await runtime.db.end();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
