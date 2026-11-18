import { qiedexPairAbi } from '@qarta/shared';
import type { Address, PublicClient } from 'viem';
import { BPS } from '../money';

/**
 * QIEDex price cross-check (docs/05-BACKEND.md). A second QIE price from the chain's own DEX.
 * It can veto a QIE quote and it lowers the price used to the smaller of oracle and pool;
 * it can never raise the price above the oracle.
 */

export interface PoolPrice {
  /** USD per 1 QIE from the WQIE/QUSDC reserves, 6 decimals, rounded down. */
  priceUsd6: bigint;
  reserveQusdc: bigint;
  reserveWqie: bigint;
}

export async function readPool(
  client: PublicClient,
  pair: Address,
  wqie: Address,
  qusdc: Address,
): Promise<PoolPrice> {
  const [token0, token1, reserves] = await Promise.all([
    client.readContract({ address: pair, abi: qiedexPairAbi, functionName: 'token0' }),
    client.readContract({ address: pair, abi: qiedexPairAbi, functionName: 'token1' }),
    client.readContract({ address: pair, abi: qiedexPairAbi, functionName: 'getReserves' }),
  ]);
  const [reserve0, reserve1] = reserves;
  const t0 = token0.toLowerCase();
  const t1 = token1.toLowerCase();
  let reserveWqie: bigint;
  let reserveQusdc: bigint;
  if (t0 === wqie.toLowerCase() && t1 === qusdc.toLowerCase()) {
    [reserveWqie, reserveQusdc] = [reserve0, reserve1];
  } else if (t0 === qusdc.toLowerCase() && t1 === wqie.toLowerCase()) {
    [reserveQusdc, reserveWqie] = [reserve0, reserve1];
  } else {
    throw new Error(`pair ${pair} is not WQIE/QUSDC (token0 ${token0}, token1 ${token1})`);
  }
  if (reserveWqie === 0n) throw new Error('pool has no WQIE');
  // QUSDC has 6 decimals and WQIE 18: price6 = reserveQusdc * 1e18 / reserveWqie.
  return { priceUsd6: (reserveQusdc * 10n ** 18n) / reserveWqie, reserveQusdc, reserveWqie };
}

export interface CrossCheckInput {
  oraclePriceUsd6: bigint;
  pool: PoolPrice | null; // null when the pool read failed
  maxDeviationBps: bigint;
  minReserveQusdc: bigint;
  enabled: boolean;
}

export type CrossCheckResult =
  | { ok: true; priceUsd6: bigint; deviationBps: bigint | null }
  | {
      ok: false;
      reason: 'pool_unavailable' | 'pool_too_thin' | 'deviation_too_high';
      deviationBps: bigint | null;
    };

export function deviationBps(a: bigint, reference: bigint): bigint {
  const diff = a > reference ? a - reference : reference - a;
  return (diff * BPS) / reference;
}

/** Decides whether a QIE quote may be made, and at which price. Fails closed. */
export function crossCheck(input: CrossCheckInput): CrossCheckResult {
  if (!input.enabled) return { ok: true, priceUsd6: input.oraclePriceUsd6, deviationBps: null };
  if (!input.pool) return { ok: false, reason: 'pool_unavailable', deviationBps: null };
  const deviation = deviationBps(input.pool.priceUsd6, input.oraclePriceUsd6);
  if (input.pool.reserveQusdc < input.minReserveQusdc) {
    return { ok: false, reason: 'pool_too_thin', deviationBps: deviation };
  }
  if (deviation > input.maxDeviationBps)
    return { ok: false, reason: 'deviation_too_high', deviationBps: deviation };
  const priceUsd6 =
    input.pool.priceUsd6 < input.oraclePriceUsd6 ? input.pool.priceUsd6 : input.oraclePriceUsd6;
  return { ok: true, priceUsd6, deviationBps: deviation };
}
