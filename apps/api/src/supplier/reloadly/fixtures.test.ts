import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SupplierRejectedError } from '../types';
import { ReloadlySupplier } from './client';

/**
 * Replays real Reloadly sandbox responses (recorded by `pnpm --filter api smoke:reloadly`,
 * secrets scrubbed) through the client, so every schema is checked against what Reloadly
 * actually sends, not against the docs.
 */

const dir = join(import.meta.dirname, '..', '..', '..', 'test', 'fixtures', 'reloadly');
const available = new Set(readdirSync(dir).filter((f) => f.endsWith('.json')));
const fixture = (name: string): { httpStatus: number; body: unknown } =>
  JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
const has = (...names: string[]) => names.every((n) => available.has(`${n}.json`));

/** Answers each URL (matched by substring, first match wins) with a recorded response. */
function replay(routes: [string, { httpStatus: number; body: unknown }][]) {
  const impl = (async (input: string | URL) => {
    const url = String(input);
    const hit = routes.find(([part]) => url.includes(part));
    if (!hit) return new Response('{"message":"no fixture"}', { status: 599 });
    return new Response(JSON.stringify(hit[1].body), { status: hit[1].httpStatus });
  }) as typeof fetch;
  return new ReloadlySupplier({
    env: 'sandbox',
    clientId: 'id',
    clientSecret: 'secret',
    orderEmail: 'o@example.com',
    fetchImpl: impl,
  });
}
const token = { httpStatus: 200, body: { access_token: 'tok', expires_in: 3600 } };

describe('Reloadly client against recorded sandbox responses', () => {
  it.runIf(has('topups-balance'))('reads the account balance in USD', async () => {
    const supplier = replay([
      ['/oauth/token', token],
      ['/accounts/balance', fixture('topups-balance')],
    ]);
    expect(await supplier.balanceUsd6()).toBeGreaterThan(0n);
  });

  it.runIf(has('topups-operators-by-country'))(
    'parses every operator of the country list',
    async () => {
      const operators = fixture('topups-operators-by-country').body as { operatorId: number }[];
      expect(operators.length).toBeGreaterThan(0);
      for (const raw of operators) {
        const supplier = replay([
          ['/oauth/token', token],
          [`/operators/${raw.operatorId}`, { httpStatus: 200, body: raw }],
        ]);
        const operator = await supplier.getOperator(raw.operatorId);
        expect(operator.operatorId).toBe(raw.operatorId);
      }
    },
  );

  it.runIf(has('topups-auto-detect'))('a failed auto-detect means "no operator"', async () => {
    const recorded = fixture('topups-auto-detect');
    const supplier = replay([
      ['/oauth/token', token],
      ['/operators/auto-detect', recorded],
    ]);
    const result = await supplier.detectOperator('08031234567', 'NG');
    if (recorded.httpStatus === 200) expect(result).not.toBeNull();
    else expect(result).toBeNull();
  });

  it.runIf(has('topups-async', 'topups-status'))(
    'sends an airtime top-up and reads its status',
    async () => {
      const supplier = replay([
        ['/oauth/token', token],
        ['/topups-async', fixture('topups-async')],
        ['/status', fixture('topups-status')],
      ]);
      const ref = await supplier.sendTopup({
        customIdentifier: 'qarta-smoke',
        operatorId: 342,
        amount: '0.04',
        countryCode: 'NG',
        phone: '08031234567',
      });
      expect(ref.transactionId).toBe('184100');
      expect((await supplier.getTopup(ref.transactionId)).status).toBe('SUCCESSFUL');
    },
  );

  it.runIf(has('topups-async-duplicate-identifier'))(
    'a reused customIdentifier on a top-up is an unknown outcome, never a rejection',
    async () => {
      const supplier = replay([
        ['/oauth/token', token],
        ['/topups-async', fixture('topups-async-duplicate-identifier')],
      ]);
      const attempt = supplier.sendTopup({
        customIdentifier: 'qarta-smoke',
        operatorId: 342,
        amount: '0.04',
        countryCode: 'NG',
        phone: '08031234567',
      });
      await expect(attempt).rejects.toThrow(/CUSTOM_IDENTIFIER/);
      await expect(attempt).rejects.not.toBeInstanceOf(SupplierRejectedError);
    },
  );

  it.runIf(has('giftcards-products-by-country'))(
    'parses every gift card product of the country list',
    async () => {
      const recorded = fixture('giftcards-products-by-country');
      const supplier = replay([
        ['/oauth/token', token],
        ['/products', recorded],
      ]);
      const products = await supplier.listGiftCards('US');
      expect(products.length).toBe((recorded.body as unknown[]).length);
    },
  );

  it.runIf(has('giftcards-order', 'giftcards-transaction-by-id', 'giftcards-order-cards'))(
    'orders a gift card, reads its status and its code',
    async () => {
      const supplier = replay([
        ['/oauth/token', token],
        ['/orders/transactions/', fixture('giftcards-order-cards')],
        ['/reports/transactions/', fixture('giftcards-transaction-by-id')],
        ['/orders', fixture('giftcards-order')],
      ]);
      const ref = await supplier.orderGiftCard({
        customIdentifier: 'qarta-smoke',
        productId: 21,
        countryCode: 'US',
        unitPrice: '5',
      });
      expect(ref.status).toBe('SUCCESSFUL');
      expect((await supplier.getGiftCardOrder(ref.transactionId)).status).toBe('SUCCESSFUL');
      const codes = await supplier.getCardCodes(ref.transactionId);
      expect(codes[0]?.code).toBeTruthy();
    },
  );

  it.runIf(has('giftcards-order-duplicate-identifier'))(
    'a reused customIdentifier is an unknown outcome, never a rejection (no refund)',
    async () => {
      const supplier = replay([
        ['/oauth/token', token],
        ['/orders', fixture('giftcards-order-duplicate-identifier')],
      ]);
      const attempt = supplier.orderGiftCard({
        customIdentifier: 'qarta-smoke',
        productId: 21,
        countryCode: 'US',
        unitPrice: '5',
      });
      await expect(attempt).rejects.toThrow(/CUSTOM_IDENTIFIER/);
      await expect(attempt).rejects.not.toBeInstanceOf(SupplierRejectedError);
    },
  );
});
