import { describe, expect, it } from 'vitest';
import { phoneHint } from './format';

describe('phoneHint', () => {
  it('gives each country its own dialling code and sample mobile number', () => {
    expect(phoneHint('EG')?.callingCode).toBe('+20');
    expect(phoneHint('NG')?.callingCode).toBe('+234');
    expect(phoneHint('EG')?.example).not.toBe(phoneHint('NG')?.example);
    expect(phoneHint('EG')?.example).toMatch(/^0\d/);
  });

  it('returns null for an unknown code', () => {
    expect(phoneHint('XX')).toBeNull();
  });
});
