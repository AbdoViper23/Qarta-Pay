/**
 * Reloadly SANDBOX smoke test.
 *
 *   pnpm --filter api smoke:reloadly
 *
 * Airtime:    token → balance → auto-detect → async top-up → status → duplicate customIdentifier
 * Gift cards: token → products → order → card code → transaction lookup
 *
 * Every response is saved, scrubbed, under test/fixtures/reloadly/ so later tests do not
 * need the network. The script refuses to run against the live API: RELOADLY_ENV must be
 * "sandbox" and every product URL is checked against the sandbox hosts before a request.
 *
 * It needs RELOADLY_CLIENT_ID and RELOADLY_CLIENT_SECRET (test credentials) in apps/api/.env.
 * Nothing sensitive is printed: only step names, HTTP status codes and top-level keys.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  RELOADLY_AUTH_URL,
  isSandboxUrl,
  reloadlyAcceptHeader,
  reloadlyBaseUrl,
  type ReloadlyProduct,
} from '../src/supplier/reloadly/endpoints';
import { redactAll, scrub, type Json } from '../src/supplier/reloadly/scrub';

const env = z
  .object({
    RELOADLY_ENV: z.literal('sandbox', {
      error: 'RELOADLY_ENV must be "sandbox". This script never calls the live API.',
    }),
    RELOADLY_CLIENT_ID: z.string().min(1),
    RELOADLY_CLIENT_SECRET: z.string().min(1),
    RELOADLY_SMOKE_PHONE: z.string().min(5).default('08012345678'),
    RELOADLY_SMOKE_COUNTRY: z.string().length(2).default('NG'),
    RELOADLY_SMOKE_GIFTCARD_COUNTRY: z.string().length(2).default('US'),
    RELOADLY_SMOKE_EMAIL: z.email().default('orders@example.com'),
  })
  .parse(process.env);

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'test',
  'fixtures',
  'reloadly',
);

interface Recorded {
  status: number;
  body: Json;
}

/**
 * Fixtures whose whole purpose is to carry secrets (gift card code and PIN). Their field
 * names are not reliably documented, so every value is hidden and only the shape is kept.
 */
const HIDE_ALL_VALUES = new Set(['giftcards-order-cards']);

async function saveFixture(name: string, recorded: Recorded): Promise<void> {
  await mkdir(fixturesDir, { recursive: true });
  const file = join(fixturesDir, `${name}.json`);
  const body = HIDE_ALL_VALUES.has(name) ? redactAll(recorded.body) : scrub(recorded.body);
  const content = { httpStatus: recorded.status, body };
  await writeFile(file, `${JSON.stringify(content, null, 2)}\n`);
}

function describeBody(body: Json): string {
  if (Array.isArray(body)) return `array(${body.length})`;
  if (body !== null && typeof body === 'object') return `{${Object.keys(body).join(', ')}}`;
  return typeof body;
}

async function readJson(response: Response): Promise<Json> {
  const text = await response.text();
  if (text === '') return null;
  try {
    return JSON.parse(text) as Json;
  } catch {
    return { nonJsonBody: text.slice(0, 500) };
  }
}

/** Sends one request, records the scrubbed response as a fixture and returns the raw body. */
async function step(name: string, url: string, init: RequestInit): Promise<Recorded> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  const recorded: Recorded = { status: response.status, body: await readJson(response) };
  await saveFixture(name, recorded);
  console.log(`${name.padEnd(34)} HTTP ${recorded.status}  ${describeBody(recorded.body)}`);
  return recorded;
}

async function getToken(product: ReloadlyProduct): Promise<string> {
  const audience = reloadlyBaseUrl('sandbox', product);
  const recorded = await step(`${product}-token`, RELOADLY_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.RELOADLY_CLIENT_ID,
      client_secret: env.RELOADLY_CLIENT_SECRET,
      grant_type: 'client_credentials',
      audience,
    }),
  });
  const parsed = z
    .object({ access_token: z.string().min(1), expires_in: z.number(), token_type: z.string() })
    .safeParse(recorded.body);
  if (recorded.status !== 200 || !parsed.success) {
    // Reloadly's error code and message carry no secret and say what is wrong,
    // e.g. CREDENTIAL_VS_ENVIRONMENT_MISMATCH = live credentials used against the sandbox.
    const error = z
      .object({ errorCode: z.string().nullish(), message: z.string().nullish() })
      .safeParse(recorded.body);
    const reason = error.success ? `${error.data.errorCode ?? ''} ${error.data.message ?? ''}` : '';
    throw new Error(
      `Could not get a ${product} sandbox token (HTTP ${recorded.status}) ${reason.trim()}. Use the Sandbox credentials (API Settings, toggle on Sandbox).`,
    );
  }
  console.log(`${''.padEnd(34)} expires_in = ${parsed.data.expires_in} s`);
  return parsed.data.access_token;
}

function client(product: ReloadlyProduct, token: string) {
  const base = reloadlyBaseUrl('sandbox', product);
  if (!isSandboxUrl(base)) throw new Error(`Refusing to call a non-sandbox URL: ${base}`);
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: reloadlyAcceptHeader(product),
    'Content-Type': 'application/json',
  };
  return {
    get: (name: string, path: string) => step(name, `${base}${path}`, { method: 'GET', headers }),
    post: (name: string, path: string, body: Json) =>
      step(name, `${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function airtime(): Promise<void> {
  console.log('\n== Airtime ==');
  const api = client('topups', await getToken('topups'));
  await api.get('topups-balance', '/accounts/balance');

  const country = env.RELOADLY_SMOKE_COUNTRY.toUpperCase();
  const detect = await api.get(
    'topups-auto-detect',
    `/operators/auto-detect/phone/${encodeURIComponent(env.RELOADLY_SMOKE_PHONE)}/countries/${country}` +
      '?suggestedAmounts=true&suggestedAmountsMap=true',
  );
  await api.get('topups-operators-by-country', `/operators/countries/${country}`);

  const operator = z
    .object({
      operatorId: z.number(),
      denominationType: z.string(),
      minAmount: z.number().nullable().optional(),
      fixedAmounts: z.array(z.number()).optional(),
    })
    .safeParse(detect.body);
  if (!operator.success) {
    console.log('Auto-detect did not return an operator; skipping the top-up steps.');
    return;
  }
  const amount = operator.data.fixedAmounts?.[0] ?? operator.data.minAmount;
  if (amount === undefined || amount === null) {
    console.log('Operator has no usable amount; skipping the top-up steps.');
    return;
  }

  const customIdentifier = `qarta-smoke-${Date.now()}`;
  const topupBody: Json = {
    operatorId: operator.data.operatorId,
    amount: String(amount),
    useLocalAmount: false,
    customIdentifier,
    recipientPhone: { countryCode: country, number: env.RELOADLY_SMOKE_PHONE },
  };
  const topup = await api.post('topups-async', '/topups-async', topupBody);
  const created = z.object({ transactionId: z.number() }).safeParse(topup.body);
  if (!created.success) {
    console.log('Async top-up did not return a transactionId; skipping the status steps.');
    return;
  }

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const status = await api.get('topups-status', `/topups/${created.data.transactionId}/status`);
    const text = JSON.stringify(status.body);
    if (!text.includes('PROCESSING')) break;
    await sleep(5_000);
  }
  await api.get(
    'topups-transaction-by-id',
    `/topups/reports/transactions/${created.data.transactionId}`,
  );

  // Open question: does Reloadly reject a reused customIdentifier? Record what the sandbox does.
  await api.post('topups-async-duplicate-identifier', '/topups-async', topupBody);
}

async function giftCards(): Promise<void> {
  console.log('\n== Gift cards ==');
  const api = client('giftcards', await getToken('giftcards'));
  await api.get('giftcards-balance', '/accounts/balance');

  const country = env.RELOADLY_SMOKE_GIFTCARD_COUNTRY.toUpperCase();
  const products = await api.get('giftcards-products-by-country', `/countries/${country}/products`);
  const list = z
    .array(
      z.object({
        productId: z.number(),
        denominationType: z.string(),
        fixedRecipientDenominations: z.array(z.number()).nullable().optional(),
      }),
    )
    .safeParse(products.body);
  if (!list.success) {
    console.log('Products response did not match the expected shape; skipping the order steps.');
    return;
  }
  const product = list.data.find(
    (item) =>
      item.denominationType === 'FIXED' && (item.fixedRecipientDenominations?.length ?? 0) > 0,
  );
  const unitPrice = product?.fixedRecipientDenominations?.[0];
  if (!product || unitPrice === undefined) {
    console.log('No FIXED product with a denomination found; skipping the order steps.');
    return;
  }

  const orderBody: Json = {
    productId: product.productId,
    countryCode: country,
    quantity: 1,
    unitPrice,
    customIdentifier: `qarta-smoke-${Date.now()}`,
    senderName: 'Qarta Pay',
    recipientEmail: env.RELOADLY_SMOKE_EMAIL,
  };
  const order = await api.post('giftcards-order', '/orders', orderBody);
  const created = z.object({ transactionId: z.number() }).safeParse(order.body);
  if (!created.success) {
    console.log('Order did not return a transactionId; skipping the card steps.');
    return;
  }
  await api.get(
    'giftcards-order-cards',
    `/orders/transactions/${created.data.transactionId}/cards`,
  );
  await api.get(
    'giftcards-transaction-by-id',
    `/reports/transactions/${created.data.transactionId}`,
  );
  await api.post('giftcards-order-duplicate-identifier', '/orders', orderBody);
}

await airtime();
await giftCards();
console.log(`\nDone. Scrubbed fixtures are in ${fixturesDir}`);
