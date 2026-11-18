import { describe, expect, it } from 'vitest';
import { crossCheck, deviationBps, type PoolPrice } from './qiedex-check';

const pool = (priceUsd6: bigint, reserveQusdc = 4_383_755_230n): PoolPrice => ({
  priceUsd6,
  reserveQusdc,
  reserveWqie: 1n,
});
const base = {
  oraclePriceUsd6: 150_000n,
  maxDeviationBps: 1500n,
  minReserveQusdc: 1_000_000_000n,
  enabled: true,
};

describe('crossCheck', () => {
  it('uses the lower pool price when the pool is under the oracle', () => {
    // The measured case of 17 Nov 2026: pool 514 bps under the oracle.
    expect(crossCheck({ ...base, oraclePriceUsd6: 154_942n, pool: pool(146_976n) })).toEqual({
      ok: true,
      priceUsd6: 146_976n,
      deviationBps: 514n,
    });
  });

  it('never prices above the oracle when the pool is higher', () => {
    const result = crossCheck({ ...base, pool: pool(160_000n) });
    expect(result).toMatchObject({ ok: true, priceUsd6: 150_000n });
  });

  it('accepts a deviation exactly at the threshold and refuses one bps above, in both directions', () => {
    expect(crossCheck({ ...base, pool: pool(127_500n) }).ok).toBe(true); // -1500 bps
    expect(crossCheck({ ...base, pool: pool(172_500n) }).ok).toBe(true); // +1500 bps
    expect(crossCheck({ ...base, pool: pool(127_484n) })).toMatchObject({
      ok: false,
      reason: 'deviation_too_high',
    });
    expect(crossCheck({ ...base, pool: pool(172_516n) })).toMatchObject({
      ok: false,
      reason: 'deviation_too_high',
    });
  });

  it('fails closed when the pool read failed or the pool is too thin', () => {
    expect(crossCheck({ ...base, pool: null })).toEqual({
      ok: false,
      reason: 'pool_unavailable',
      deviationBps: null,
    });
    expect(crossCheck({ ...base, pool: pool(150_000n, 999_999_999n) })).toMatchObject({
      ok: false,
      reason: 'pool_too_thin',
    });
  });

  it('can be switched off by the ops flag, falling back to the oracle price', () => {
    expect(crossCheck({ ...base, enabled: false, pool: null })).toEqual({
      ok: true,
      priceUsd6: 150_000n,
      deviationBps: null,
    });
  });

  it('computes deviation against the reference', () => {
    expect(deviationBps(90n, 100n)).toBe(1000n);
    expect(deviationBps(110n, 100n)).toBe(1000n);
    expect(deviationBps(100n, 100n)).toBe(0n);
  });
});
