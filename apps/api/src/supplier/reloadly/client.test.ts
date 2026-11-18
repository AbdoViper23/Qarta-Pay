import { describe, expect, it } from 'vitest';
import { SupplierRejectedError } from '../types';
import { ReloadlySupplier } from './client';

/** A fake fetch that answers by URL and records every request. */
function fakeFetch(
  routes: Record<
    string,
    { status?: number; body: unknown } | (() => { status?: number; body: unknown })
  >,
) {
  const requests: { url: string; method: string; body?: unknown }[] = [];
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const key = Object.keys(routes).find((prefix) => url.includes(prefix));
    if (!key) return new Response(JSON.stringify({ message: 'no route' }), { status: 599 });
    const route = routes[key]!;
    const { status = 200, body } = typeof route === 'function' ? route() : route;
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, requests };
}

const token = { body: { access_token: 'tok', expires_in: 86_400, token_type: 'Bearer' } };
const make = (fetchImpl: typeof fetch) =>
  new ReloadlySupplier({
    env: 'sandbox',
    clientId: 'id',
    clientSecret: 'secret',
    orderEmail: 'o@example.com',
    fetchImpl,
  });

describe('ReloadlySupplier', () => {
  it('uses the sandbox hosts and the product audience', async () => {
    const { impl, requests } = fakeFetch({
      '/oauth/token': token,
      '/accounts/balance': { body: { balance: 5000.23, currencyCode: 'USD' } },
    });
    expect(await make(impl).balanceUsd6()).toBe(5_000_230_000n);
    expect(requests[0]?.body).toMatchObject({ audience: 'https://topups-sandbox.reloadly.com' });
    expect(requests[1]?.url).toBe('https://topups-sandbox.reloadly.com/accounts/balance');
  });

  it('caches the token and refreshes it once on a 401', async () => {
    let calls = 0;
    const { impl, requests } = fakeFetch({
      '/oauth/token': token,
      '/accounts/balance': () =>
        ++calls === 2 ? { status: 401, body: {} } : { body: { balance: 1, currencyCode: 'USD' } },
    });
    const supplier = make(impl);
    await supplier.balanceUsd6();
    await supplier.balanceUsd6(); // 401, then refresh + retry
    expect(requests.filter((r) => r.url.includes('/oauth/token'))).toHaveLength(2);
    expect(calls).toBe(3);
  });

  it('sends an async top-up with our order id as customIdentifier', async () => {
    const { impl, requests } = fakeFetch({
      '/oauth/token': token,
      '/topups-async': { body: { transactionId: 28805 } },
    });
    const ref = await make(impl).sendTopup({
      customIdentifier: '0xabc',
      operatorId: 341,
      amount: '5',
      countryCode: 'NG',
      phone: '2348031234567',
    });
    expect(ref).toEqual({ transactionId: '28805', status: 'PROCESSING' });
    expect(requests[1]?.body).toEqual({
      operatorId: 341,
      amount: '5',
      useLocalAmount: false,
      customIdentifier: '0xabc',
      recipientPhone: { countryCode: 'NG', number: '2348031234567' },
    });
  });

  it('treats a 400 as a definite rejection and a 5xx or timeout-like status as unknown', async () => {
    const rejected = fakeFetch({
      '/oauth/token': token,
      '/topups-async': { status: 400, body: { message: 'Invalid amount' } },
    });
    await expect(
      make(rejected.impl).sendTopup({
        customIdentifier: 'x',
        operatorId: 1,
        amount: '1',
        countryCode: 'NG',
        phone: '1',
      }),
    ).rejects.toBeInstanceOf(SupplierRejectedError);

    for (const status of [500, 502, 408, 429]) {
      const unknown = fakeFetch({
        '/oauth/token': token,
        '/topups-async': { status, body: { message: 'oops' } },
      });
      const error = await make(unknown.impl)
        .sendTopup({
          customIdentifier: 'x',
          operatorId: 1,
          amount: '1',
          countryCode: 'NG',
          phone: '1',
        })
        .catch((e: unknown) => e);
      expect(error).not.toBeInstanceOf(SupplierRejectedError);
    }
  });

  it('reads airtime status in both the flat and the nested shape', async () => {
    const flat = fakeFetch({
      '/oauth/token': token,
      '/status': { body: { transactionId: 1, status: 'SUCCESSFUL' } },
    });
    expect((await make(flat.impl).getTopup('1')).status).toBe('SUCCESSFUL');
    const nested = fakeFetch({
      '/oauth/token': token,
      '/status': { body: { status: 'X', transaction: { status: 'REFUNDED' } } },
    });
    // Top-level wins when present; an unknown value maps to UNKNOWN, never to SUCCESSFUL.
    expect((await make(nested.impl).getTopup('1')).status).toBe('UNKNOWN');
    const onlyNested = fakeFetch({
      '/oauth/token': token,
      '/status': { body: { transaction: { status: 'REFUNDED' } } },
    });
    expect((await make(onlyNested.impl).getTopup('1')).status).toBe('REFUNDED');
  });

  it('finds a top-up by customIdentifier and ignores other entries', async () => {
    const { impl, requests } = fakeFetch({
      '/oauth/token': token,
      '/topups/reports/transactions': {
        body: { content: [{ transactionId: 7, status: 'SUCCESSFUL', customIdentifier: 'other' }] },
      },
    });
    expect(await make(impl).findTopup('0xabc')).toBeNull();
    expect(requests[1]?.url).toContain('customIdentifier=0xabc');
  });

  it('maps gift card products, keeping only fixed denominations, with exact amounts', async () => {
    const { impl } = fakeFetch({
      '/oauth/token': token,
      '/countries/US/products': {
        body: [
          {
            productId: 5,
            productName: 'Amazon US',
            denominationType: 'FIXED',
            recipientCurrencyCode: 'USD',
            senderCurrencyCode: 'USD',
            senderFee: 0.3,
            fixedRecipientToSenderDenominationsMap: { '10.0': 9.85 },
            brand: { brandName: 'Amazon' },
            country: { isoName: 'US' },
          },
          {
            productId: 6,
            productName: 'Range card',
            denominationType: 'RANGE',
            recipientCurrencyCode: 'USD',
            senderCurrencyCode: 'USD',
          },
        ],
      },
    });
    const products = await make(impl).listGiftCards('US');
    expect(products[0]).toMatchObject({
      productId: 5,
      senderFee: '0.3',
      denominations: [{ recipient: '10', sender: '9.85' }],
    });
    expect(products[1]?.denominations).toEqual([]);
  });

  it('reads card codes and refuses an empty or code-less response', async () => {
    const ok = fakeFetch({
      '/oauth/token': token,
      '/cards': { body: [{ cardNumber: 6120200345149064, pinCode: 5821 }] },
    });
    expect(await make(ok.impl).getCardCodes('1')).toEqual([
      { code: '6120200345149064', pin: '5821' },
    ]);
    const empty = fakeFetch({ '/oauth/token': token, '/cards': { body: [] } });
    await expect(make(empty.impl).getCardCodes('1')).rejects.toThrow('empty');
    const noCode = fakeFetch({ '/oauth/token': token, '/cards': { body: [{ pinCode: 1 }] } });
    await expect(make(noCode.impl).getCardCodes('1')).rejects.toThrow('no code');
  });
});
