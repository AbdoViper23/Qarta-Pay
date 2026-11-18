import { aggregatorV3Abi } from '@qarta/shared';
import type { Address, PublicClient } from 'viem';

export interface OraclePrice {
  /** USD per 1 QIE, 6 decimals, rounded down. */
  priceUsd6: bigint;
  updatedAt: Date;
  ageSeconds: number;
}

/** Reads the QIE/USD feed. Throws if the answer is not positive. */
export async function readOracle(
  client: PublicClient,
  feed: Address,
  now = new Date(),
): Promise<OraclePrice> {
  const [decimals, round] = await Promise.all([
    client.readContract({ address: feed, abi: aggregatorV3Abi, functionName: 'decimals' }),
    client.readContract({ address: feed, abi: aggregatorV3Abi, functionName: 'latestRoundData' }),
  ]);
  const [, answer, , updatedAt] = round;
  if (answer <= 0n) throw new Error(`oracle answer not positive: ${answer}`);
  const priceUsd6 = (answer * 1_000_000n) / 10n ** BigInt(decimals);
  const updated = new Date(Number(updatedAt) * 1000);
  return {
    priceUsd6,
    updatedAt: updated,
    ageSeconds: Math.floor((now.getTime() - updated.getTime()) / 1000),
  };
}
