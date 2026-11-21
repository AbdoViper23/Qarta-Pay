import { qartaCheckoutAbi } from '@qarta/shared';
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  custom,
  erc20Abi,
  http,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { createSiweMessage } from 'viem/siwe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChainStatus, CheckoutWriter } from '../../src/chain/checkout-writer';
import { loadConfig, type AppConfig } from '../../src/config';
import { acquireLease, releaseLease, type JobsResult } from '../../src/jobs';
import { getOrder, transition, type OrderStatus } from '../../src/db/orders';
import type { Db } from '../../src/db/pool';
import { createLogger } from '../../src/log';
import { createRuntime, type Runtime } from '../../src/runtime';
import { FakeSupplier } from '../../src/supplier/fake';
import { ANVIL_MNEMONIC, artifact, startAnvil, type Anvil } from '../helpers/anvil';
import { freshDatabase } from '../helpers/db';

/**
 * End-to-end on a local chain: the real QartaCheckout contract and mocks on anvil, a real
 * PostgreSQL, the real API, indexer and worker, and the in-memory FakeSupplier.
 */

const account = (index: number) => mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: index });
const deployer = account(0);
const quoteSigner = account(1);
const fulfiller = account(2);
const payer = account(3);
const stranger = account(4);
const treasury: Address = '0x000000000000000000000000000000000000bEEF';
const mockWqie: Address = '0x00000000000000000000000000000000000000AA';
const pairAbi = parseAbi(['function setReserves(uint112 reserve0, uint112 reserve1)']);
const mintAbi = parseAbi(['function mint(address to, uint256 amount)']);

let anvil: Anvil;
let db: Db;
let runtime: Runtime;
let supplier: FakeSupplier;
let qusdc: Address;
let pair: Address;
let checkout: Address;
let config: AppConfig;
const publicClient = () => createPublicClient({ chain: foundry, transport: http(anvil.url) });
const testClient = () =>
  createTestClient({ chain: foundry, mode: 'anvil', transport: http(anvil.url) });
const wallet = (who = payer) =>
  createWalletClient({ chain: foundry, account: who, transport: http(anvil.url) });

async function deploy(name: string, args: unknown[], file = `${name}.sol`): Promise<Address> {
  const { abi, bytecode } = artifact(file, name);
  const hash = await wallet(deployer).deployContract({ abi, bytecode, args });
  const receipt = await publicClient().waitForTransactionReceipt({ hash });
  return receipt.contractAddress!;
}

beforeAll(async () => {
  anvil = await startAnvil();
  ({ db } = await freshDatabase());

  qusdc = await deploy('MockERC20', ['QUSDC', 'QUSDC']);
  const feed = await deploy('MockAggregatorV3', [8, 15_000_000n]); // $0.15 per QIE
  pair = await deploy('MockPair', [mockWqie, qusdc, 100_000n * 10n ** 18n, 15_000n * 10n ** 6n]);
  checkout = await deploy('QartaCheckout', [
    deployer.address,
    quoteSigner.address,
    fulfiller.address,
    treasury,
    qusdc,
    feed,
    86_400,
    1_000,
    true,
    7_200n,
  ]);
  const startBlock = await publicClient().getBlockNumber();

  await wallet(deployer).writeContract({
    address: qusdc,
    abi: mintAbi,
    functionName: 'mint',
    args: [payer.address, 1_000n * 10n ** 6n],
  });
  await wallet().writeContract({
    address: qusdc,
    abi: erc20Abi,
    functionName: 'approve',
    args: [checkout, 2n ** 255n],
  });

  const hdKey = (who: typeof payer) =>
    `0x${Buffer.from(who.getHdKey().privateKey!).toString('hex')}` as Hex;
  config = loadConfig({
    CHAIN_ID: '31337',
    RPC_URLS: anvil.url,
    CHECKOUT_ADDRESS: checkout,
    START_BLOCK: startBlock.toString(),
    CONFIRMATIONS: '0',
    QUOTE_SIGNER_KEY: hdKey(quoteSigner),
    FULFILLER_KEY: hdKey(fulfiller),
    QUSDC_ADDRESS: qusdc,
    QIE_USD_FEED: feed,
    QIEDEX_WQIE_QUSDC_PAIR: pair,
    WQIE_ADDRESS: mockWqie,
    DATABASE_URL: 'unused-db-is-injected',
    CODE_ENCRYPTION_KEY: 'ab'.repeat(32),
    SESSION_SECRET: 'x'.repeat(40),
    RELOADLY_ENV: 'sandbox',
    RELOADLY_CLIENT_ID: 'unused',
    RELOADLY_CLIENT_SECRET: 'unused',
    WEB_ORIGIN: 'http://localhost:3000',
    PRICE_CACHE_MS: '0',
    LOG_LEVEL: 'silent',
  });
  supplier = new FakeSupplier();
  runtime = await createRuntime(config, createLogger(process.env.TEST_LOG ?? 'silent'), {
    supplier,
    db,
  });
});

afterAll(async () => {
  await runtime?.server.close();
  await db?.end();
  anvil?.stop();
});

// ------------------------------------------------------------------ helpers

interface QuoteBody {
  orderId: Hex;
  quote: {
    orderId: Hex;
    payer: Address;
    token: Address;
    amount: string;
    usdAmount: string;
    expiry: string;
  };
  signature: Hex;
  display: { usd: string; payAmount: string };
}

async function requestQuote(
  body: Record<string, unknown>,
): Promise<{ status: number; json: QuoteBody & { error?: string } }> {
  const response = await runtime.server.inject({
    method: 'POST',
    url: '/v1/quotes',
    payload: { payer: payer.address, ...body },
  });
  return { status: response.statusCode, json: response.json() };
}

async function quote(body: Record<string, unknown>): Promise<QuoteBody> {
  const { status, json } = await requestQuote(body);
  expect(status, JSON.stringify(json)).toBe(200);
  return json;
}

const airtime = (phoneSuffix: string, payToken = 'QUSDC') => ({
  kind: 'AIRTIME',
  payToken,
  countryCode: 'NG',
  recipientPhone: `0803123${phoneSuffix}`,
  operatorId: 341,
  amount: '5',
});

async function pay(q: QuoteBody): Promise<void> {
  const native = q.quote.token === '0x0000000000000000000000000000000000000000';
  const hash = await wallet().writeContract({
    address: checkout,
    abi: qartaCheckoutAbi,
    functionName: 'pay',
    args: [
      {
        orderId: q.quote.orderId,
        payer: q.quote.payer,
        token: q.quote.token,
        amount: BigInt(q.quote.amount),
        usdAmount: BigInt(q.quote.usdAmount),
        expiry: BigInt(q.quote.expiry),
      },
      q.signature,
    ],
    value: native ? BigInt(q.quote.amount) : 0n,
  });
  const receipt = await publicClient().waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe('success');
}

/** Runs indexer and worker until the order reaches `status` (or fails after a few rounds). */
async function driveTo(orderId: Hex, status: OrderStatus): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await runtime.indexer.tick();
    await db.query('update orders set next_attempt_at = null where id = $1', [orderId]); // skip waiting
    await runtime.worker.tick();
    if ((await getOrder(db, orderId))?.status === status) return;
  }
  const order = await getOrder(db, orderId);
  throw new Error(
    `order stuck in ${order?.status} (${order?.reviewReason ?? ''}), expected ${status}`,
  );
}

const qusdcBalance = (who: Address) =>
  publicClient().readContract({
    address: qusdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [who],
  });
const chainStatus = async (orderId: Hex) =>
  (
    await publicClient().readContract({
      address: checkout,
      abi: qartaCheckoutAbi,
      functionName: 'orders',
      args: [orderId],
    })
  )[4];
const supplierCalls = (orderId: Hex, method: string) =>
  supplier.calls.filter((call) => call.customIdentifier === orderId && call.method === method)
    .length;

// -------------------------------------------------------------------- tests

describe('quote → pay → deliver → settle', () => {
  it('airtime paid in QUSDC is delivered once and settled to the treasury', async () => {
    const q = await quote(airtime('4567'));
    expect(q.display.usd).toBe('5.2'); // $5 + 4% margin
    const treasuryBefore = await qusdcBalance(treasury);

    await pay(q);
    await runtime.indexer.tick();
    expect((await getOrder(db, q.orderId))?.status).toBe('PAID');

    await driveTo(q.orderId, 'SETTLED');
    const order = (await getOrder(db, q.orderId))!;
    expect(order.settleTxHash).toMatch(/^0x/);
    expect(order.deliveredAt).not.toBeNull();
    expect(await qusdcBalance(treasury)).toBe(treasuryBefore + 5_200_000n);
    expect(await chainStatus(q.orderId)).toBe(2);
    expect(supplierCalls(q.orderId, 'sendTopup')).toBe(1);

    const view = (await runtime.server.inject({ url: `/v1/orders/${q.orderId}` })).json();
    expect(view.status).toBe('SETTLED');
    expect(view.recipient).toBe('+234••••4567'); // phone masked in public view
  });

  it('a gift card paid in native QIE is settled, and only the buyer can reveal its code', async () => {
    const q = await quote({
      kind: 'GIFT_CARD',
      payToken: 'QIE',
      countryCode: 'US',
      productId: 5,
      unitPrice: '10',
    });
    await pay(q);
    await driveTo(q.orderId, 'SETTLED');

    const signIn = async (who: typeof payer) => {
      const { nonce } = (
        await runtime.server.inject({ method: 'POST', url: '/v1/auth/nonce' })
      ).json();
      const message = createSiweMessage({
        domain: 'localhost:3000',
        address: who.address,
        uri: 'http://localhost:3000',
        version: '1',
        chainId: 31337,
        nonce,
        statement: 'Sign in to Qarta Pay',
      });
      const signature = await who.signMessage({ message });
      const response = await runtime.server.inject({
        method: 'POST',
        url: '/v1/auth/verify',
        payload: { message, signature },
      });
      expect(response.statusCode).toBe(200);
      return response.json().token as string;
    };

    const buyerToken = await signIn(payer);
    const reveal = await runtime.server.inject({
      url: `/v1/orders/${q.orderId}/code`,
      headers: { authorization: `Bearer ${buyerToken}` },
    });
    expect(reveal.statusCode).toBe(200);
    expect(reveal.json().codes[0].code).toMatch(/^FAKE-/);
    expect(reveal.headers['cache-control']).toBe('no-store');

    const strangerToken = await signIn(stranger);
    const denied = await runtime.server.inject({
      url: `/v1/orders/${q.orderId}/code`,
      headers: { authorization: `Bearer ${strangerToken}` },
    });
    expect(denied.statusCode).toBe(404);
    expect((await runtime.server.inject({ url: `/v1/orders/${q.orderId}/code` })).statusCode).toBe(
      401,
    );

    // The public order view never contains the code.
    expect(
      JSON.stringify((await runtime.server.inject({ url: `/v1/orders/${q.orderId}` })).json()),
    ).not.toContain('FAKE-');

    const history = await runtime.server.inject({
      url: '/v1/orders',
      headers: { authorization: `Bearer ${buyerToken}` },
    });
    expect(history.json().orders.some((o: { id: string }) => o.id === q.orderId)).toBe(true);
  });

  it('a SIWE nonce cannot be used twice', async () => {
    const { nonce } = (
      await runtime.server.inject({ method: 'POST', url: '/v1/auth/nonce' })
    ).json();
    const message = createSiweMessage({
      domain: 'localhost:3000',
      address: payer.address,
      uri: 'http://localhost:3000',
      version: '1',
      chainId: 31337,
      nonce,
    });
    const signature = await payer.signMessage({ message });
    const first = await runtime.server.inject({
      method: 'POST',
      url: '/v1/auth/verify',
      payload: { message, signature },
    });
    const second = await runtime.server.inject({
      method: 'POST',
      url: '/v1/auth/verify',
      payload: { message, signature },
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(401);
  });
});

describe('failure paths', () => {
  it('supplier REFUNDED → on-chain refund to the payer', async () => {
    const before = await qusdcBalance(payer.address);
    const q = await quote(airtime('0000'));
    await pay(q);
    await driveTo(q.orderId, 'REFUNDED');
    expect(await qusdcBalance(payer.address)).toBe(before);
    expect(await chainStatus(q.orderId)).toBe(3);
    expect((await getOrder(db, q.orderId))?.refundTxHash).toMatch(/^0x/);
  });

  it('supplier rejects the request → refund without a second supplier call', async () => {
    const q = await quote(airtime('2222'));
    await pay(q);
    await driveTo(q.orderId, 'REFUNDED');
    expect(supplierCalls(q.orderId, 'sendTopup')).toBe(1);
  });

  it('network error after the supplier received the call → looked up, not resent, then settled', async () => {
    const q = await quote(airtime('3333'));
    await pay(q);
    await driveTo(q.orderId, 'SETTLED');
    expect(supplierCalls(q.orderId, 'sendTopup')).toBe(1);
    expect(supplierCalls(q.orderId, 'findTopup')).toBeGreaterThanOrEqual(1);
  });

  it('crash between the supplier call and the DB write → recovered by lookup, delivered once', async () => {
    const q = await quote(airtime('5678'));
    await pay(q);
    await runtime.indexer.tick();
    // Simulate the crash: attempt recorded, supplier called, transaction id never written.
    const order = (await getOrder(db, q.orderId))!;
    await transition(db, q.orderId, ['PAID'], 'FULFILLING', { supplierAttemptedAt: new Date() });
    await supplier.sendTopup({
      customIdentifier: q.orderId,
      amount: order.supplierAmount,
      phone: order.recipientPhone!,
    });

    await driveTo(q.orderId, 'SETTLED');
    expect(supplierCalls(q.orderId, 'sendTopup')).toBe(1);
  });

  it('unknown outcome with no supplier record → NEEDS_REVIEW, no refund, no resend', async () => {
    const q = await quote(airtime('6789'));
    await pay(q);
    await runtime.indexer.tick();
    // Attempt recorded 3 minutes ago, but the supplier never got the call.
    await transition(db, q.orderId, ['PAID'], 'FULFILLING', {
      supplierAttemptedAt: new Date(Date.now() - 180_000),
    });

    await driveTo(q.orderId, 'NEEDS_REVIEW');
    expect(supplierCalls(q.orderId, 'sendTopup')).toBe(0);
    expect(await chainStatus(q.orderId)).toBe(1); // still escrowed, a human decides
  });

  it('a supplier that stays PROCESSING past the poll limit → NEEDS_REVIEW', async () => {
    const q = await quote(airtime('1111'));
    await pay(q);
    await runtime.indexer.tick();
    await runtime.worker.tick();
    expect((await getOrder(db, q.orderId))?.status).toBe('FULFILLING');
    await db.query(
      `update orders set supplier_attempted_at = now() - interval '31 minutes' where id = $1`,
      [q.orderId],
    );
    await driveTo(q.orderId, 'NEEDS_REVIEW');
    expect(await chainStatus(q.orderId)).toBe(1);
  });

  it('past the fulfilment cutoff → refunded without calling the supplier', async () => {
    const q = await quote(airtime('7890'));
    await pay(q);
    await runtime.indexer.tick();
    // refundTimeout 2 h, cutoff 45 min before: pretend payment was 80 minutes ago.
    await db.query(`update orders set paid_at = now() - interval '80 minutes' where id = $1`, [
      q.orderId,
    ]);
    await driveTo(q.orderId, 'REFUNDED');
    expect(supplierCalls(q.orderId, 'sendTopup')).toBe(0);
  });

  it('OrderPaid that does not match the stored quote → NEEDS_REVIEW, never fulfilled', async () => {
    const q = await quote(airtime('8901'));
    await db.query('update orders set usd_amount = usd_amount + 1 where id = $1', [q.orderId]);
    await pay(q);
    await runtime.indexer.tick();
    await runtime.worker.tick();
    expect((await getOrder(db, q.orderId))?.status).toBe('NEEDS_REVIEW');
    expect(supplierCalls(q.orderId, 'sendTopup')).toBe(0);
  });

  it('replaying already indexed blocks changes nothing', async () => {
    const callsBefore = supplier.calls.length;
    const snapshot = (await db.query('select id, status, updated_at from orders order by id')).rows;
    await db.query('delete from indexer_cursor');
    await runtime.indexer.tick();
    await runtime.worker.tick();
    expect(supplier.calls.length).toBe(callsBefore);
    expect((await db.query('select id, status, updated_at from orders order by id')).rows).toEqual(
      snapshot,
    );
  });
  it('settle does not trust eth_fillTransaction gas (QIE nodes return intrinsic gas only)', async () => {
    const q = await quote(airtime('8911'));
    await pay(q);
    // A transport that answers like a QIE node: eth_fillTransaction with gas 0x5448.
    const qieLike = custom({
      async request({ method, params }) {
        const result = await publicClient().request({ method, params } as never);
        if (method === 'eth_fillTransaction') {
          const filled = result as { tx: Record<string, unknown> };
          return { ...filled, tx: { ...filled.tx, gas: '0x5448' } };
        }
        return result;
      },
    });
    const writer = new CheckoutWriter(
      {
        chain: foundry,
        publicClient: createPublicClient({ chain: foundry, transport: qieLike }),
        fulfiller: createWalletClient({ chain: foundry, account: fulfiller, transport: qieLike }),
        quoteSigner,
      },
      checkout,
    );
    const hash = await writer.settle(q.quote.orderId);
    expect((await publicClient().getTransactionReceipt({ hash })).status).toBe('success');
    expect(await writer.chainStatus(q.quote.orderId)).toBe(ChainStatus.Settled);
  });

  it('a cursor left by another deployment does not move the start block', async () => {
    await db.query(
      `insert into indexer_cursor (id, last_block) values ('1983:0x0000000000000000000000000000000000000001', 1)`,
    );
    expect(await runtime.indexer.lastProcessedBlock()).toBeGreaterThan(1n);
    const ids = (await db.query<{ id: string }>('select id from indexer_cursor order by id')).rows;
    expect(ids.map((r) => r.id)).toContain(runtime.indexer.cursorId);
    expect(runtime.indexer.cursorId).toBe(`31337:${checkout.toLowerCase()}`);
  });
});

describe('pricing and limits', () => {
  it('QIE quotes use the lower of oracle and pool price', async () => {
    // Pool at $0.14 (oracle $0.15): 100,000 QIE / 14,000 QUSDC.
    await wallet(deployer).writeContract({
      address: pair,
      abi: pairAbi,
      functionName: 'setReserves',
      args: [100_000n * 10n ** 18n, 14_000n * 10n ** 6n],
    });
    const q = await quote(airtime('4567', 'QIE'));
    const usd = BigInt(q.quote.usdAmount);
    const atPool = (usd * 10n ** 18n) / 140_000n;
    expect(BigInt(q.quote.amount)).toBeGreaterThan(atPool); // pool price plus spread
  });

  it('QIE quotes are refused when the pool deviates too far; QUSDC quotes still work', async () => {
    // Pool at $0.10: 33% under the oracle, above the 15% threshold.
    await wallet(deployer).writeContract({
      address: pair,
      abi: pairAbi,
      functionName: 'setReserves',
      args: [100_000n * 10n ** 18n, 10_000n * 10n ** 6n],
    });
    const refused = await requestQuote(airtime('4567', 'QIE'));
    expect(refused.status).toBe(503);
    expect(refused.json.error).toBe('qie_price_unavailable');
    expect((await requestQuote(airtime('4567', 'QUSDC'))).status).toBe(200);

    const prices = (await runtime.server.inject({ url: '/v1/prices' })).json();
    expect(prices.qieQuotesEnabled).toBe(false);
    expect(prices.reason).toBe('deviation_too_high');
    await wallet(deployer).writeContract({
      address: pair,
      abi: pairAbi,
      functionName: 'setReserves',
      args: [100_000n * 10n ** 18n, 15_000n * 10n ** 6n],
    });
  });

  it('rejects orders above the per-order limit and invalid input', async () => {
    const tooBig = await requestQuote({ ...airtime('4567'), amount: '49' }); // $49 + margin > $50
    expect(tooBig.status).toBe(400);
    expect(tooBig.json.error).toBe('limit_order');
    expect((await requestQuote({ ...airtime('4567'), recipientPhone: '123' })).status).toBe(400);
    expect((await requestQuote({ ...airtime('4567'), amount: '0.1' })).json.error).toBe(
      'invalid_amount',
    );
    expect((await requestQuote({ ...airtime('4567'), countryCode: 'FR' })).json.error).toBe(
      'country_not_enabled',
    );
  });

  it('reports identity null on a chain without QIE ID, and config with contract addresses', async () => {
    const identity = (await runtime.server.inject({ url: `/v1/identity/${payer.address}` })).json();
    expect(identity.qieName).toBeNull();
    const config = (await runtime.server.inject({ url: '/v1/config' })).json();
    expect(config.contracts.checkout.toLowerCase()).toBe(checkout.toLowerCase());
    const stats = (await runtime.server.inject({ url: '/v1/stats' })).json();
    expect(stats.ordersSettled).toBeGreaterThanOrEqual(3);
  });
});

describe('serverless hosting (Vercel)', () => {
  it('a job lease has one holder at a time and frees on release or expiry', async () => {
    expect(await acquireLease(db, 'test-lease', 'a', 60)).toBe(true);
    expect(await acquireLease(db, 'test-lease', 'b', 60)).toBe(false);
    await releaseLease(db, 'test-lease', 'b'); // not the holder: no effect
    expect(await acquireLease(db, 'test-lease', 'b', 60)).toBe(false);
    await releaseLease(db, 'test-lease', 'a');
    expect(await acquireLease(db, 'test-lease', 'b', 0)).toBe(true); // expires at once
    expect(await acquireLease(db, 'test-lease', 'c', 60)).toBe(true);
  });

  it('serves under /api, runs jobs from the cron route only with the secret, and settles an order', async () => {
    const secret = 's'.repeat(32);
    const background: Promise<unknown>[] = [];
    const serverless = await createRuntime(
      { ...config, CRON_SECRET: secret },
      createLogger(process.env.TEST_LOG ?? 'silent'),
      {
        supplier,
        db,
        serverless: { basePath: '/api', background: (task) => background.push(task) },
      },
    );
    try {
      const get = (url: string, token?: string) =>
        serverless.server.inject({
          method: 'GET',
          url,
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });

      expect((await get('/api/v1/config')).json().chainId).toBe(31337);
      expect((await get('/api/v1/jobs/run')).statusCode).toBe(401);
      expect((await get('/api/v1/jobs/run', 'x'.repeat(32))).statusCode).toBe(401);
      // The GET above kicked one background pass.
      expect(background.length).toBe(1);
      await Promise.all(background);

      const q = await quote(airtime('8921'));
      await pay(q);
      for (let i = 0; i < 12; i += 1) {
        // skip the worker's wait between steps, as driveTo does
        await db.query('update orders set next_attempt_at = null where id = $1', [q.quote.orderId]);
        const result = (await get('/api/v1/jobs/run', secret)).json() as JobsResult;
        expect(result.ran).toBe(true);
        if ((await getOrder(db, q.quote.orderId))?.status === 'SETTLED') break;
      }
      expect((await getOrder(db, q.quote.orderId))?.status).toBe('SETTLED');
      expect(supplierCalls(q.quote.orderId, 'sendTopup')).toBe(1);
    } finally {
      await serverless.server.close();
    }
  });

  it('the cron route is absent without CRON_SECRET or outside serverless mode', async () => {
    const response = await runtime.server.inject({ method: 'GET', url: '/v1/jobs/run' });
    expect(response.statusCode).toBe(404);
  });
});

describe('payer self-refund (runs last: it moves chain time forward)', () => {
  it('claimRefund after the timeout is picked up by the indexer as REFUNDED by payer', async () => {
    const q = await quote(airtime('9012'));
    await pay(q);
    await runtime.indexer.tick();
    await testClient().increaseTime({ seconds: 7_201 });
    await testClient().mine({ blocks: 1 });
    const hash = await wallet().writeContract({
      address: checkout,
      abi: qartaCheckoutAbi,
      functionName: 'claimRefund',
      args: [q.orderId],
    });
    await publicClient().waitForTransactionReceipt({ hash });

    await runtime.indexer.tick();
    const order = (await getOrder(db, q.orderId))!;
    expect(order.status).toBe('REFUNDED');
    expect(order.refundedByPayer).toBe(true);
    await runtime.worker.tick();
    expect(supplierCalls(q.orderId, 'sendTopup')).toBe(0);
  });
});
