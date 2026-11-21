import { getChainConfig } from '@qarta/shared';
import { getAddress, isAddress, isHex, type Address, type Hex } from 'viem';
import { z } from 'zod';

/**
 * Every setting comes from the environment (apps/api/.env.example lists them all).
 * Contract addresses default to packages/shared/config/<chain>.json and can be overridden,
 * which is how testnet and anvil point at our mocks.
 */

const address = z
  .string()
  .refine((value) => isAddress(value), 'not an address')
  .transform((value): Address => getAddress(value));
const optionalAddress = z.preprocess((v) => (v === '' ? undefined : v), address.optional());
const privateKey = z
  .string()
  .refine((value) => isHex(value) && value.length === 66, 'must be a 32-byte hex key')
  .transform((value) => value as Hex);
const bool = z.enum(['true', 'false']).transform((value) => value === 'true');
const bigintString = z
  .string()
  .regex(/^\d+$/, 'must be an integer')
  .transform((value) => BigInt(value));

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),

  CHAIN_ID: z.coerce.number().int().positive(),
  RPC_URLS: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((url) => url.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
  CHECKOUT_ADDRESS: address,
  START_BLOCK: bigintString,
  CONFIRMATIONS: z.coerce.number().int().min(0).default(2),
  QUOTE_SIGNER_KEY: privateKey,
  FULFILLER_KEY: privateKey,

  QUSDC_ADDRESS: optionalAddress,
  QIE_USD_FEED: optionalAddress,
  QIEDEX_WQIE_QUSDC_PAIR: optionalAddress,
  WQIE_ADDRESS: optionalAddress,
  QIE_REVERSE_RESOLVER: optionalAddress,
  QIE_NAME_REGISTRY_B: optionalAddress,

  DATABASE_URL: z.string().min(1),
  CODE_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 32 bytes of hex'),
  SESSION_SECRET: z.string().min(32),

  RELOADLY_ENV: z.enum(['sandbox', 'live']),
  RELOADLY_CLIENT_ID: z.string().min(1),
  RELOADLY_CLIENT_SECRET: z.string().min(1),
  RELOADLY_ORDER_EMAIL: z.email().default('orders@example.com'),

  MARGIN_BPS: z.coerce.bigint().default(400n),
  QIE_SPREAD_BPS: z.coerce.bigint().default(150n),
  MAX_ORDER_USD: z.coerce.number().positive().default(50),
  MAX_WALLET_DAILY_USD: z.coerce.number().positive().default(100),
  MAX_GLOBAL_DAILY_USD: z.coerce.number().positive().default(1000),
  QUOTE_TTL_QUSDC_S: z.coerce.number().int().positive().default(600),
  QUOTE_TTL_QIE_S: z.coerce.number().int().positive().default(90),
  SALES_PAUSED: bool.default(false),
  FULFIL_CUTOFF_BEFORE_TIMEOUT_S: z.coerce.number().int().min(0).default(2700),
  SUPPLIER_POLL_MAX_S: z.coerce.number().int().positive().default(1800),

  ORACLE_MAX_AGE_S: z.coerce.number().int().positive().default(86_400),
  DEX_ORACLE_MAX_DEVIATION_BPS: z.coerce.bigint().default(1500n),
  DEX_MIN_RESERVE_QUSDC: z.coerce.bigint().default(1_000_000_000n),
  DEX_PRICE_CHECK_ENABLED: bool.default(true),

  PRICE_CACHE_MS: z.coerce.number().int().min(0).default(15_000),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(3000),
  INDEXER_POLL_MS: z.coerce.number().int().positive().default(3000),
  FULFILLER_MIN_BALANCE_WEI: bigintString.default(10n ** 18n),
  SUPPLIER_MIN_BALANCE_USD: z.coerce.number().min(0).default(50),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  // Serverless hosting (Vercel): no background loops; requests and a cron run the jobs.
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  // Bearer token for GET /v1/jobs/run (cron callers). Unset: the route answers 404.
  CRON_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(16).optional()),
});

export type Env = z.infer<typeof envSchema>;

const localChain = {
  explorerUrl: '',
  addresses: {
    qusdc: null,
    qieUsdFeed: null,
    qiedexWqieQusdcPair: null,
    wqie: null,
    qieReverseResolver: null,
    qieNameRegistryB: null,
  },
} as const;

export interface AppConfig extends Env {
  addresses: {
    checkout: Address;
    qusdc: Address;
    qieUsdFeed: Address | null;
    pair: Address | null;
    wqie: Address | null;
    reverseResolver: Address | null;
    nameRegistryB: Address | null;
  };
  explorerUrl: string;
  /** Host and port of WEB_ORIGIN; SIWE messages must name it. */
  siweDomain: string;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = envSchema.parse(source);
  // Anvil (31337) and other local chains have no shared config: every address comes from env.
  const chain = env.CHAIN_ID === 31337 ? localChain : getChainConfig(env.CHAIN_ID);
  const qusdc = env.QUSDC_ADDRESS ?? chain.addresses.qusdc;
  if (!qusdc) throw new Error(`QUSDC_ADDRESS is required on chain ${env.CHAIN_ID}`);
  if (env.CHAIN_ID === 1990 && env.RELOADLY_ENV !== 'live') {
    // Not an error: a mainnet dry run with sandbox delivery is allowed, but it must be visible.
    console.warn('CHAIN_ID is mainnet but RELOADLY_ENV is sandbox: nothing will be delivered.');
  }
  return {
    ...env,
    addresses: {
      checkout: env.CHECKOUT_ADDRESS,
      qusdc,
      qieUsdFeed: env.QIE_USD_FEED ?? chain.addresses.qieUsdFeed,
      pair: env.QIEDEX_WQIE_QUSDC_PAIR ?? chain.addresses.qiedexWqieQusdcPair,
      wqie: env.WQIE_ADDRESS ?? chain.addresses.wqie,
      reverseResolver: env.QIE_REVERSE_RESOLVER ?? chain.addresses.qieReverseResolver,
      nameRegistryB: env.QIE_NAME_REGISTRY_B ?? chain.addresses.qieNameRegistryB,
    },
    explorerUrl: chain.explorerUrl,
    siweDomain: new URL(env.WEB_ORIGIN).host,
  };
}
