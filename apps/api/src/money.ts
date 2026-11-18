/**
 * Money helpers. Token amounts are bigint base units; API boundaries use decimal strings.
 * Floats never touch money. Prices round UP (we never undercharge), payouts round DOWN.
 */

export const USD_DECIMALS = 6;
export const BPS = 10_000n;

/** Parses a non-negative decimal string ("12.5") into base units with `decimals`. */
export function parseUnitsStrict(value: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error(`not a decimal amount: ${value}`);
  const [whole = '0', fraction = ''] = value.split('.');
  if (fraction.length > decimals)
    throw new Error(`too many decimals in ${value} (max ${decimals})`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

/** Formats base units as a decimal string without trailing zeros ("12.5", "3"). */
export function formatUnitsPlain(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/** Converts a JSON number from a supplier (e.g. 5.25) into base units, exactly. */
export function numberToUnits(value: number, decimals: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new Error(`invalid amount ${value}`);
  // toFixed with the target precision gives the decimal the supplier meant; the guard below
  // rejects values that need more precision than we keep.
  const text = value.toFixed(decimals);
  if (Math.abs(Number(text) - value) > 10 ** -(decimals + 2)) throw new Error(`imprecise ${value}`);
  return parseUnitsStrict(text, decimals);
}

export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new Error('division by non-positive');
  return a === 0n ? 0n : (a - 1n) / b + 1n;
}

/** a × (1 + bps/10000), rounded up. */
export function addBpsUp(amount: bigint, bps: bigint): bigint {
  return ceilDiv(amount * (BPS + bps), BPS);
}
