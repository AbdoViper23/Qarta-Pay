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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ChainStatus, CheckoutWriter } from '../../src/chain/checkout-writer';
import { loadConfig, type AppConfig } from '../../src/config';
import { acquireLease, releaseLease, type JobsResult } from '../../src/jobs';
import { getOrder, supplierCostReserved, transition, type OrderStatus } from '../../src/db/orders';
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
    // The free-order offer is off here so prices stay fixed; its own test turns it on.
    FREE_ORDERS_PER_WALLET: '0',
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
  display: {
    usd: string;
    payAmount: string;
    productUsd: string;
    feeUsd: string;
    feePercent: string;
    qiePriceUsd: string | null;
    freeOrder: boolean;
  };
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

async function pay(q: QuoteBody, who = payer): Promise<void> {
  const native = q.quote.token === '0x0000000000000000000000000000000000000000';
  const hash = await wallet(who).writeContract({
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
    expect(q.display.usd).toBe('5.25'); // $5 + 5% margin
    expect(q.display).toMatchObject({
      productUsd: '5',
      feeUsd: '0.25',
      feePercent: '5',
      qiePriceUsd: null,
    });
    const treasuryBefore = await qusdcBalance(treasury);

    await pay(q);
    await runtime.indexer.tick();
    expect((await getOrder(db, q.orderId))?.status).toBe('PAID');

    await driveTo(q.orderId, 'SETTLED');
    const order = (await getOrder(db, q.orderId))!;
    expect(order.settleTxHash).toMatch(/^0x/);
    expect(order.deliveredAt).not.toBeNull();
    expect(await qusdcBalance(treasury)).toBe(treasuryBefore + 5_250_000n);
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

  it('refuses a quote the supplier balance cannot cover, and still sells what it can', async () => {
    // Its own client address, so these quotes do not use up the shared rate-limit bucket.
    const quoteFrom = async (body: Record<string, unknown>) => {
      const response = await runtime.server.inject({
        method: 'POST',
        url: '/v1/quotes',
        remoteAddress: '10.0.0.77',
        payload: { payer: payer.address, ...body },
      });
      return { status: response.statusCode, json: response.json() as { error?: string } };
    };
    // $3 free at the supplier on top of what other wallets' open quotes already reserve
    // (this wallet's own earlier quotes do not count against it).
    supplier.balance = (await supplierCostReserved(db, payer.address)) + 3_000_000n;
    // Skip past the 30 s balance cache so the new balance is read.
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 31_000);
    try {
      const tooBig = await quoteFrom(airtime('4567')); // $5 product
      expect(tooBig.status).toBe(503);
      expect(tooBig.json.error).toBe('supplier_balance_low');
      expect((await quoteFrom({ ...airtime('4567'), amount: '2' })).status).toBe(200);
      // That $2 is now reserved for another wallet: its $2 would need $4 of the $3.
      // (The same wallet asking again replaces its own quote; see the next test.)
      const other = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 13 }).address;
      expect((await quoteFrom({ ...airtime('4568'), amount: '2', payer: other })).json.error).toBe(
        'supplier_balance_low',
      );
    } finally {
      // Put the $1,000 balance back and make the cache read it, so later tests see it.
      supplier.balance = 1_000_000_000n;
      clock.mockReturnValue(now + 62_000);
      await quoteFrom({ ...airtime('4569'), amount: '2' });
      clock.mockRestore();
    }
  });

  it("a wallet's own unpaid quotes do not block its next quote; other wallets still see them", async () => {
    const quoteAs = async (who: Address, ip: string, amount = '5') => {
      const response = await runtime.server.inject({
        method: 'POST',
        url: '/v1/quotes',
        remoteAddress: ip,
        payload: { ...airtime('4590'), amount, payer: who },
      });
      return { status: response.statusCode, json: response.json() as { error?: string } };
    };
    const alice = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 11 }).address;
    const bob = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 12 }).address;
    // $6 free at the supplier on top of what other open quotes already reserve.
    supplier.balance = (await supplierCostReserved(db)) + 6_000_000n;
    const now = Date.now() + 400_000; // well past any balance cache an earlier test left
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      // Alice asks for the same $5 price four times (refreshing, changing her mind).
      for (let i = 0; i < 4; i += 1) expect((await quoteAs(alice, '10.0.0.91')).status).toBe(200);
      // Bob still sees Alice's open $5 quote: only $1 is free for him.
      expect((await quoteAs(bob, '10.0.0.92')).json.error).toBe('supplier_balance_low');
      // Alice's own repeated quotes also do not use up her daily limit ($100): 3 x $45.
      for (let i = 0; i < 3; i += 1) {
        supplier.balance = 1_000_000_000n;
        clock.mockReturnValue(now + 62_000 + i * 31_000);
        expect((await quoteAs(alice, '10.0.0.91', '45')).status).toBe(200);
      }
    } finally {
      supplier.balance = 1_000_000_000n;
      clock.mockReturnValue(now + 200_000);
      await quoteAs(bob, '10.0.0.92', '2'); // refresh the balance cache for later tests
      clock.mockRestore();
    }
  });

  it('rejects orders above the per-order limit and invalid input', async () => {
    const tooBig = await requestQuote({ ...airtime('4567'), amount: '49.5' }); // $49.50 + 5% > $50
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
    expect(config.pricing).toEqual({
      feePercent: '5',
      qieBufferPercent: '1.5',
      freeOrdersPerWallet: 0,
      freeOrderMaxUsd: 20,
      freeOrderCostPercent: '2',
    });
    const stats = (await runtime.server.inject({ url: '/v1/stats' })).json();
    expect(stats.ordersSettled).toBeGreaterThanOrEqual(3);
  });
});

describe('free orders', () => {
  /** A fresh wallet with QUSDC and an approval, so earlier orders of `payer` do not count. */
  async function freshBuyer(index: number) {
    const buyer = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: index });
    await wallet(deployer).writeContract({
      address: qusdc,
      abi: mintAbi,
      functionName: 'mint',
      args: [buyer.address, 200n * 10n ** 6n],
    });
    const hash = await wallet(buyer).writeContract({
      address: qusdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [checkout, 2n ** 255n],
    });
    await publicClient().waitForTransactionReceipt({ hash });
    return buyer;
  }
  // Its own client address, so these quotes do not use up the shared rate-limit bucket.
  async function quoteFor(buyer: { address: Address }, phoneSuffix: string): Promise<QuoteBody> {
    const response = await runtime.server.inject({
      method: 'POST',
      url: '/v1/quotes',
      remoteAddress: '10.0.0.88',
      payload: { ...airtime(phoneSuffix), payer: buyer.address },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json() as QuoteBody;
  }
  const freeLeft = async (buyer: { address: Address }) =>
    (await runtime.server.inject({ url: `/v1/free-orders/${buyer.address}` })).json().left;

  it('the first 3 paid orders of a wallet carry no fee, the 4th pays it', async () => {
    config.FREE_ORDERS_PER_WALLET = 3;
    try {
      const buyer = await freshBuyer(7);
      expect(await freeLeft(buyer)).toBe(3);
      for (let i = 0; i < 3; i += 1) {
        const q = await quoteFor(buyer, `710${i}`);
        expect(q.display).toMatchObject({
          usd: '5.1', // $5 + 2% payment costs, no Qarta fee
          feeUsd: '0.1',
          feePercent: '2',
          freeOrder: true,
          waivedFeeUsd: '0.25',
          freeOrdersLeft: 3 - i,
          freeOrdersTotal: 3,
        });
        await pay(q, buyer);
        await driveTo(q.orderId, 'SETTLED');
      }
      expect(await freeLeft(buyer)).toBe(0);
      const fourth = await quoteFor(buyer, '7104');
      expect(fourth.display).toMatchObject({ usd: '5.25', freeOrder: false, freeOrdersLeft: 0 });
    } finally {
      config.FREE_ORDERS_PER_WALLET = 0;
    }
  });

  it('a free quote paid after the free orders ran out is refunded, never delivered', async () => {
    config.FREE_ORDERS_PER_WALLET = 1;
    try {
      const buyer = await freshBuyer(8);
      // Two quotes taken before paying either: both are free at quote time.
      const first = await quoteFor(buyer, '7201');
      const second = await quoteFor(buyer, '7202');
      expect(first.display.freeOrder && second.display.freeOrder).toBe(true);
      await pay(first, buyer);
      await pay(second, buyer);
      await driveTo(first.orderId, 'SETTLED');
      await driveTo(second.orderId, 'REFUNDED');
      expect(supplierCalls(second.orderId, 'sendTopup')).toBe(0);
      // The wallet's one free order is used; the refunded extra one does not change that.
      expect(await freeLeft(buyer)).toBe(0);
    } finally {
      config.FREE_ORDERS_PER_WALLET = 0;
    }
  });

  it('free orders cover products up to FREE_ORDER_MAX_USD only', async () => {
    config.FREE_ORDERS_PER_WALLET = 3;
    config.FREE_ORDER_MAX_USD = 4;
    try {
      const q = await quoteFor(await freshBuyer(9), '7301'); // $5 product
      expect(q.display).toMatchObject({ usd: '5.25', freeOrder: false, freeOrdersLeft: 3 });
    } finally {
      config.FREE_ORDERS_PER_WALLET = 0;
      config.FREE_ORDER_MAX_USD = 20;
    }
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

  it('starts and serves config while the RPC is down, and refuses quotes with 503', async () => {
    const offline = await createRuntime(
      { ...config, RPC_URLS: ['http://127.0.0.1:1'] },
      createLogger(process.env.TEST_LOG ?? 'silent'),
      { supplier, db },
    );
    try {
      const before = await db.query('select count(*)::int as n from orders');
      expect((await offline.server.inject({ method: 'GET', url: '/v1/config' })).statusCode).toBe(
        200,
      );
      const response = await offline.server.inject({
        method: 'POST',
        url: '/v1/quotes',
        payload: { payer: payer.address, ...airtime('7310') },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error).toBe('chain_unavailable');
      const after = await db.query('select count(*)::int as n from orders');
      expect(after.rows[0].n).toBe(before.rows[0].n); // nothing stored, nothing signed
    } finally {
      await offline.server.close();
    }
  });

  it('lists worldwide gift cards and searches every country', async () => {
    const global = await runtime.server.inject({
      method: 'GET',
      url: '/v1/giftcards?country=GLOBAL',
    });
    expect(global.statusCode).toBe(200);
    expect(global.json().products.map((p: { productId: number }) => p.productId)).toEqual([77]);
    const found = await runtime.server.inject({
      method: 'GET',
      url: '/v1/giftcards/search?q=amazon',
    });
    expect(found.json().products.map((p: { name: string }) => p.name)).toEqual(['Amazon US']);
    const short = await runtime.server.inject({ method: 'GET', url: '/v1/giftcards/search?q=a' });
    expect(short.statusCode).toBe(400);
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
