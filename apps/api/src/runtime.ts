import type { Address } from 'viem';
import { Alerter } from './alerts';
import { Catalog, loadCatalogConfig } from './catalog/catalog';
import { CheckoutWriter } from './chain/checkout-writer';
import { createClients, type Clients } from './chain/clients';
import { lazyContractLimits } from './chain/contract-limits';
import type { AppConfig } from './config';
import { expireQuotes } from './db/orders';
import { migrate } from './db/migrate';
import { createPool, type Db } from './db/pool';
import { resolveQieName } from './identity/qie-name';
import { Indexer } from './indexer/indexer';
import { createJobRunner, type JobRunner } from './jobs';
import type { Logger } from './log';
import { formatUnitsPlain, parseUnitsStrict } from './money';
import { PriceService } from './pricing/prices';
import { QuoteService } from './quotes/quote-service';
import { buildServer } from './server';
import { FakeSupplier } from './supplier/fake';
import { ReloadlySupplier } from './supplier/reloadly/client';
import type { Supplier } from './supplier/types';
import { FulfilmentWorker } from './worker/fulfilment';

export interface Runtime {
  db: Db;
  clients: Clients;
  supplier: Supplier;
  indexer: Indexer;
  worker: FulfilmentWorker;
  writer: CheckoutWriter;
  alerter: Alerter;
  housekeeping: () => Promise<void>;
  jobs: JobRunner;
  server: Awaited<ReturnType<typeof buildServer>>;
}

/** Serverless hosting: no loops; requests and a cron drive the jobs (src/jobs.ts). */
export interface ServerlessOptions {
  /** Path prefix the host forwards unchanged, e.g. "/api" on Vercel. */
  basePath: string;
  /** Keeps a promise alive after the response is sent (Vercel: waitUntil). */
  background: (task: Promise<unknown>) => void;
}

/**
 * Wires every module together. `supplier` may be injected (tests, local demo); otherwise
 * Reloadly is used. The fake supplier is refused on mainnet.
 */
export async function createRuntime(
  config: AppConfig,
  log: Logger,
  options: { supplier?: Supplier; db?: Db; serverless?: ServerlessOptions } = {},
): Promise<Runtime> {
  const db = options.db ?? createPool(config.DATABASE_URL, config.DB_POOL_MAX);
  await migrate(db);
  const clients = createClients(config);
  const supplier =
    options.supplier ??
    new ReloadlySupplier({
      env: config.RELOADLY_ENV,
      clientId: config.RELOADLY_CLIENT_ID,
      clientSecret: config.RELOADLY_CLIENT_SECRET,
      orderEmail: config.RELOADLY_ORDER_EMAIL,
    });
  if (supplier instanceof FakeSupplier && config.CHAIN_ID === 1990)
    throw new Error('fake supplier on mainnet');

  const alerter = new Alerter(
    log,
    config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID
      ? { token: config.TELEGRAM_BOT_TOKEN, chatId: config.TELEGRAM_CHAT_ID }
      : undefined,
  );
  const writer = new CheckoutWriter(clients, config.addresses.checkout);

  // The backend must never sign quotes the contract would reject (docs/05-BACKEND.md).
  // Checked on first use, so a slow RPC cannot keep the API from starting.
  const contractLimits = lazyContractLimits(async () => {
    const [refundTimeoutSeconds, maxOracleAgeSeconds] = await Promise.all([
      writer.refundTimeoutSeconds(),
      writer.maxOracleAgeSeconds(),
    ]);
    return { refundTimeoutSeconds, maxOracleAgeSeconds };
  }, config);

  const refusals = new Map<string, number>();
  const prices = new PriceService(
    clients.publicClient,
    config,
    (reason) => {
      const since = refusals.get(reason) ?? Date.now();
      refusals.set(reason, since);
      if (Date.now() - since > 10 * 60_000)
        void alerter.send(`qie-refused:${reason}`, `QIE quotes refused for 10+ min: ${reason}`);
    },
    config.PRICE_CACHE_MS,
  );
  const catalog = new Catalog(supplier, loadCatalogConfig());
  const quotes = new QuoteService(
    db,
    config,
    catalog,
    supplier,
    prices,
    clients.quoteSigner,
    contractLimits,
  );
  const indexer = new Indexer(
    db,
    clients.publicClient,
    config.addresses.checkout,
    config.START_BLOCK,
    config.CONFIRMATIONS,
    log,
    alerter,
  );
  const worker = new FulfilmentWorker(db, supplier, writer, config, contractLimits, log, alerter);

  let healthCache: { at: number; value: Record<string, unknown> } | null = null;
  const health = async () => {
    if (healthCache && Date.now() - healthCache.at < 15_000) return healthCache.value;
    const [lag, balance] = await Promise.all([
      indexer.lag().catch(() => null),
      supplier.balanceUsd6().catch(() => null),
    ]);
    const value = {
      indexerLagBlocks: lag === null ? null : Number(lag),
      supplierBalanceOk:
        balance === null
          ? null
          : balance >= parseUnitsStrict(config.SUPPLIER_MIN_BALANCE_USD.toFixed(6), 6),
    };
    healthCache = { at: Date.now(), value };
    return value;
  };

  const housekeeping = async () => {
    await expireQuotes(db, 300);
    const stuck = await db.query<{ id: string; status: string }>(
      `select id, status from orders where status in ('PAID', 'FULFILLING') and paid_at < now() - interval '10 minutes'`,
    );
    for (const row of stuck.rows)
      await alerter.send(`stuck:${row.id}`, `Order ${row.id} stuck in ${row.status} > 10 min`);
    const gas = await writer.fulfillerBalance().catch(() => null);
    if (gas !== null && gas < config.FULFILLER_MIN_BALANCE_WEI) {
      await alerter.send('fulfiller-gas', `Fulfiller gas low: ${formatUnitsPlain(gas, 18)} QIE`);
    }
    const balance = await supplier.balanceUsd6().catch(() => null);
    if (
      balance !== null &&
      balance < parseUnitsStrict(config.SUPPLIER_MIN_BALANCE_USD.toFixed(6), 6)
    ) {
      await alerter.send(
        'supplier-balance',
        `Supplier balance low: $${formatUnitsPlain(balance, 6)}`,
      );
    }
    const lag = await indexer.lag().catch(() => null);
    if (lag !== null && lag * 4n > 60n)
      await alerter.send('indexer-lag', `Indexer is ${lag} blocks behind`);
  };

  const jobs = createJobRunner({ db, indexer, worker, housekeeping, log });
  const serverless = options.serverless;

  const server = await buildServer({
    config,
    db,
    catalog,
    quotes,
    prices,
    resolveName: (wallet: Address) =>
      resolveQieName(
        clients.publicClient,
        wallet,
        config.addresses.reverseResolver,
        config.addresses.nameRegistryB,
      ),
    health,
    log,
    ...(serverless && {
      basePath: serverless.basePath,
      onActivity: () => {
        const task = jobs.kick();
        if (task) serverless.background(task);
      },
      runJobs: jobs.run,
    }),
  });

  return { db, clients, supplier, indexer, worker, writer, alerter, housekeeping, jobs, server };
}

/** Runs `fn` every `ms`, never overlapping itself; returns a stop function. */
export function loop(
  name: string,
  ms: number,
  fn: () => Promise<unknown>,
  log: Logger,
): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const run = async () => {
    try {
      await fn();
    } catch (error) {
      log.error({ err: error, loop: name }, 'loop iteration failed');
    }
    if (!stopped) timer = setTimeout(run, ms);
  };
  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
