import { timingSafeEqual } from 'node:crypto';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { getAddress, isAddress, isHex, type Address, type Hex } from 'viem';
import { z, ZodError } from 'zod';
import { AuthError, issueNonce, readSession, verifySignIn } from './auth/siwe';
import type { Catalog } from './catalog/catalog';
import { decryptCodes } from './codes';
import type { AppConfig } from './config';
import { getOrder, listOrdersByWallet } from './db/orders';
import type { Db } from './db/pool';
import type { JobsResult } from './jobs';
import type { Logger } from './log';
import { formatUnitsPlain } from './money';
import type { PriceService } from './pricing/prices';
import { QuoteError } from './quotes/pricing';
import { quoteRequestSchema, type QuoteService } from './quotes/quote-service';
import { presentOrder } from './routes/presenters';
import { readStats } from './stats';

export interface ServerDeps {
  config: AppConfig;
  db: Db;
  catalog: Catalog;
  quotes: QuoteService;
  prices: PriceService;
  resolveName: (wallet: Address) => Promise<string | null>;
  health: () => Promise<Record<string, unknown>>;
  log?: Logger;
  /** Public path prefix the host forwards unchanged (Vercel: "/api"). Stripped before routing. */
  basePath?: string;
  /** Called after each GET response; serverless hosts start background jobs from it. */
  onActivity?: () => void;
  /** Runs one pass of the background jobs, for GET /v1/jobs/run (cron). */
  runJobs?: () => Promise<JobsResult>;
}

const walletParam = z
  .string()
  .refine((value) => isAddress(value), 'not an address')
  .transform((v) => getAddress(v));
const orderIdParam = z
  .string()
  .refine((value) => isHex(value) && value.length === 66, 'not an order id');

function bearer(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

/** Builds the HTTP API (docs/05-BACKEND.md). All inputs are validated with zod. */
export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const basePath = deps.basePath ?? '';
  const app = Fastify({
    logger: false,
    trustProxy: true,
    rewriteUrl: (request) => {
      const url = request.url ?? '/';
      if (!basePath) return url;
      if (url === basePath) return '/';
      return url.startsWith(`${basePath}/`) ? url.slice(basePath.length) : url;
    },
  });

  await app.register(cors, { origin: [config.WEB_ORIGIN], methods: ['GET', 'POST'] });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.setErrorHandler((error, _request, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      return reply
        .status(400)
        .send({ error: 'invalid_request', message: error.issues.map((i) => i.message).join('; ') });
    }
    if (error instanceof QuoteError)
      return reply.status(error.httpStatus).send({ error: error.code, message: error.message });
    if (error instanceof AuthError)
      return reply.status(401).send({ error: 'unauthorized', message: error.message });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500)
      return reply
        .status(status)
        .send({ error: 'request_error', message: (error as Error).message });
    deps.log?.error({ err: error }, 'request failed');
    return reply.status(500).send({ error: 'internal_error', message: 'something went wrong' });
  });

  if (deps.onActivity) {
    const onActivity = deps.onActivity;
    app.addHook('onResponse', async (request) => {
      if (request.method === 'GET' && request.routeOptions.url !== '/v1/jobs/run') onActivity();
    });
  }

  app.get('/healthz', async () => ({ status: 'ok', ...(await deps.health()) }));

  // Cron entry point for serverless hosting. 404 unless CRON_SECRET is set and jobs are wired.
  app.get('/v1/jobs/run', async (request, reply) => {
    const secret = config.CRON_SECRET;
    if (!secret || !deps.runJobs) return reply.status(404).send({ error: 'not_found' });
    const given = Buffer.from(bearer(request) ?? '');
    const expected = Buffer.from(secret);
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      return reply.status(401).send({ error: 'unauthorized' });
    return deps.runJobs();
  });

  app.get('/v1/config', async () => {
    // Country lists come from the supplier; if it is down the page still loads, without them.
    const [airtimeCountries, giftCardCountries] = await Promise.all([
      deps.catalog.airtimeCountries().catch((err: unknown) => {
        deps.log?.warn({ err }, 'airtime countries unavailable');
        return [];
      }),
      deps.catalog.giftCardCountries().catch((err: unknown) => {
        deps.log?.warn({ err }, 'gift card countries unavailable');
        return [];
      }),
    ]);
    return {
      chainId: config.CHAIN_ID,
      explorerUrl: config.explorerUrl,
      salesPaused: config.SALES_PAUSED,
      contracts: {
        checkout: config.addresses.checkout,
        qusdc: config.addresses.qusdc,
        qieUsdFeed: config.addresses.qieUsdFeed,
        qiedexPair: config.addresses.pair,
        wqie: config.addresses.wqie,
        qieReverseResolver: config.addresses.reverseResolver,
        qieNameRegistryB: config.addresses.nameRegistryB,
      },
      airtimeCountries,
      giftCardCountries,
      limits: {
        maxOrderUsd: config.MAX_ORDER_USD,
        maxWalletDailyUsd: config.MAX_WALLET_DAILY_USD,
        quoteTtlQusdcS: config.QUOTE_TTL_QUSDC_S,
        quoteTtlQieS: config.QUOTE_TTL_QIE_S,
      },
    };
  });

  app.get('/v1/prices', async () => {
    const snapshot = await deps.prices.get();
    return {
      oracle: snapshot.oracle && {
        priceUsd: formatUnitsPlain(snapshot.oracle.priceUsd6, 6),
        updatedAt: snapshot.oracle.updatedAt.toISOString(),
        ageSeconds: snapshot.oracle.ageSeconds,
      },
      pool: snapshot.pool && {
        priceUsd: formatUnitsPlain(snapshot.pool.priceUsd6, 6),
        reserveQusdc: formatUnitsPlain(snapshot.pool.reserveQusdc, 6),
        reserveQie: formatUnitsPlain(snapshot.pool.reserveWqie, 18),
      },
      deviationBps: snapshot.check?.deviationBps?.toString() ?? null,
      qieQuotesEnabled: snapshot.qie.enabled,
      qiePriceUsd: snapshot.qie.enabled ? formatUnitsPlain(snapshot.qie.priceUsd6, 6) : null,
      reason: snapshot.qie.enabled ? null : snapshot.qie.reason,
      readAt: snapshot.readAt.toISOString(),
    };
  });

  app.get('/v1/identity/:wallet', async (request) => {
    const wallet = walletParam.parse((request.params as { wallet: string }).wallet);
    const cached = await db.query<{ qie_name: string | null }>(
      `select qie_name from wallet_profile where wallet = $1 and name_checked_at > now() - interval '1 hour'`,
      [wallet.toLowerCase()],
    );
    if (cached.rows[0]) return { wallet, qieName: cached.rows[0].qie_name };
    const name = await deps.resolveName(wallet);
    await db.query(
      `insert into wallet_profile (wallet, qie_name, name_checked_at) values ($1, $2, now())
       on conflict (wallet) do update set qie_name = excluded.qie_name, name_checked_at = excluded.name_checked_at`,
      [wallet.toLowerCase(), name],
    );
    return { wallet, qieName: name };
  });

  app.get('/v1/airtime/detect', async (request) => {
    const query = z
      .object({ phone: z.string().min(5).max(20), country: z.string().regex(/^[A-Z]{2}$/) })
      .parse(request.query);
    const { normalisePhone } = await import('./quotes/quote-service');
    const phone = normalisePhone(query.phone, query.country);
    const operator = await deps.catalog.detectOperator(phone, query.country);
    if (!operator) return { operator: null };
    return { operator, phoneE164: `+${phone}` };
  });

  app.get('/v1/giftcards', async (request) => {
    const { country } = z
      .object({ country: z.union([z.literal('GLOBAL'), z.string().regex(/^[A-Z]{2}$/)]) })
      .parse(request.query);
    const products =
      country === 'GLOBAL'
        ? await deps.catalog.globalGiftCards()
        : await deps.catalog.giftCards(country);
    return { products };
  });

  app.get(
    '/v1/giftcards/search',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { q } = z.object({ q: z.string().trim().min(2).max(40) }).parse(request.query);
      return { products: await deps.catalog.searchGiftCards(q) };
    },
  );

  app.post(
    '/v1/quotes',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      return deps.quotes.create(quoteRequestSchema.parse(request.body));
    },
  );

  app.get('/v1/orders/:id', async (request, reply) => {
    const id = orderIdParam.parse((request.params as { id: string }).id);
    const order = await getOrder(db, id);
    if (!order) return reply.status(404).send({ error: 'not_found', message: 'no such order' });
    return presentOrder(order);
  });

  app.get('/v1/orders', async (request, reply) => {
    const wallet = readSession(bearer(request), config.SESSION_SECRET);
    if (!wallet) return reply.status(401).send({ error: 'unauthorized', message: 'sign in first' });
    return { wallet, orders: (await listOrdersByWallet(db, wallet)).map(presentOrder) };
  });

  app.get('/v1/orders/:id/code', async (request, reply) => {
    const id = orderIdParam.parse((request.params as { id: string }).id);
    const wallet = readSession(bearer(request), config.SESSION_SECRET);
    if (!wallet) return reply.status(401).send({ error: 'unauthorized', message: 'sign in first' });
    const order = await getOrder(db, id);
    if (!order || order.recipientWallet !== wallet.toLowerCase()) {
      return reply
        .status(404)
        .send({ error: 'not_found', message: 'no such order for this wallet' });
    }
    if (!order.codeCiphertext || !['DELIVERED', 'SETTLED'].includes(order.status)) {
      return reply
        .status(409)
        .send({ error: 'not_ready', message: 'the code is not available yet' });
    }
    reply.header('Cache-Control', 'no-store');
    return {
      orderId: order.id,
      codes: decryptCodes(order.codeCiphertext, config.CODE_ENCRYPTION_KEY),
    };
  });

  app.post(
    '/v1/auth/nonce',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async () => ({
      nonce: await issueNonce(db),
    }),
  );

  app.post(
    '/v1/auth/verify',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const body = z
        .object({
          message: z.string().min(10).max(2000),
          signature: z.string().refine((v) => isHex(v), 'not hex'),
        })
        .parse(request.body);
      const session = await verifySignIn(
        db,
        { message: body.message, signature: body.signature as Hex },
        { domain: config.siweDomain, chainId: config.CHAIN_ID, secret: config.SESSION_SECRET },
      );
      return {
        token: session.token,
        address: session.address,
        expiresAt: session.expiresAt.toISOString(),
      };
    },
  );

  app.get('/v1/stats', async () => ({
    ...(await readStats(db)),
    checkout: config.addresses.checkout,
  }));

  return app;
}
