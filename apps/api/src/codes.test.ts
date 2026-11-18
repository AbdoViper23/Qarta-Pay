import { describe, expect, it } from 'vitest';
import { decryptCodes, encryptCodes } from './codes';

const KEY = 'ab'.repeat(32);

describe('gift card code encryption', () => {
  it('round-trips and never stores the plain code', () => {
    const codes = [{ code: 'ABCD-1234-EFGH', pin: '5821' }];
    const stored = encryptCodes(codes, KEY);
    expect(stored).not.toContain('ABCD');
    expect(decryptCodes(stored, KEY)).toEqual(codes);
  });

  it('uses a fresh IV each time', () => {
    const codes = [{ code: 'X', pin: null }];
    expect(encryptCodes(codes, KEY)).not.toBe(encryptCodes(codes, KEY));
  });

  it('rejects a wrong key or tampered data', () => {
    const stored = encryptCodes([{ code: 'X', pin: null }], KEY);
    expect(() => decryptCodes(stored, 'cd'.repeat(32))).toThrow();
    const parts = stored.split(':');
    parts[3] = `${parts[3]!.slice(0, -2)}${parts[3]!.endsWith('00') ? '01' : '00'}`;
    expect(() => decryptCodes(parts.join(':'), KEY)).toThrow();
  });
});
