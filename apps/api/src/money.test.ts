import { describe, expect, it } from 'vitest';
import { addBpsUp, ceilDiv, formatUnitsPlain, numberToUnits, parseUnitsStrict } from './money';

describe('money', () => {
  it('parses and formats decimal strings exactly', () => {
    expect(parseUnitsStrict('12.5', 6)).toBe(12_500_000n);
    expect(parseUnitsStrict('0.000001', 6)).toBe(1n);
    expect(parseUnitsStrict('7', 18)).toBe(7n * 10n ** 18n);
    expect(formatUnitsPlain(12_500_000n, 6)).toBe('12.5');
    expect(formatUnitsPlain(3_000_000n, 6)).toBe('3');
    expect(formatUnitsPlain(1n, 6)).toBe('0.000001');
  });

  it('rejects malformed or over-precise input', () => {
    for (const bad of ['', '-1', '1e3', '1.', '.5', 'abc', '1.0000001']) {
      expect(() => parseUnitsStrict(bad, 6)).toThrow();
    }
  });

  it('converts supplier JSON numbers without float drift', () => {
    expect(numberToUnits(5.25, 6)).toBe(5_250_000n);
    expect(numberToUnits(0.1 + 0.2, 6)).toBe(300_000n);
    expect(numberToUnits(60553.3575, 6)).toBe(60_553_357_500n);
    expect(() => numberToUnits(-1, 6)).toThrow();
    expect(() => numberToUnits(Number.NaN, 6)).toThrow();
  });

  it('rounds up when adding a margin and when dividing', () => {
    expect(addBpsUp(10_000_000n, 400n)).toBe(10_400_000n);
    expect(addBpsUp(1n, 400n)).toBe(2n); // 1.04 -> 2
    expect(ceilDiv(10n, 3n)).toBe(4n);
    expect(ceilDiv(9n, 3n)).toBe(3n);
    expect(ceilDiv(0n, 3n)).toBe(0n);
  });
});
