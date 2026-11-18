import { describe, expect, it } from 'vitest';
import { countryName, shortAddress, trimDecimals } from './format';

describe('shortAddress', () => {
  it('keeps the first six and last four characters', () => {
    expect(shortAddress('0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5')).toBe('0x3F43…5DA5');
  });

  it('rejects anything that is not a 20-byte hex address', () => {
    expect(() => shortAddress('0x1234')).toThrow('not an address');
    expect(() => shortAddress('molivo.qie')).toThrow('not an address');
  });
});

describe('display helpers', () => {
  it('trims decimals without rounding up', () => {
    expect(trimDecimals('68.038319181362943609', 4)).toBe('68.0383');
    expect(trimDecimals('5.2', 4)).toBe('5.2');
    expect(trimDecimals('7.00001', 2)).toBe('7');
  });

  it('names countries', () => {
    expect(countryName('NG')).toBe('Nigeria');
  });
});
