import { describe, expect, it } from 'vitest';
import { redactAll, scrub } from './scrub';
import { isSandboxUrl, reloadlyBaseUrl } from './endpoints';

describe('scrub', () => {
  it('redacts tokens, phone numbers, e-mails and card codes at any depth', () => {
    const scrubbed = scrub({
      access_token: 'eyJ.secret',
      expires_in: 86400,
      transaction: {
        recipientPhone: '2348012345678',
        recipientEmail: 'someone@mail.test',
        customIdentifier: '0xabc',
        cards: [{ cardNumber: 6120200345149064, pinCode: '5821' }],
      },
    });
    expect(scrubbed).toEqual({
      access_token: 'REDACTED',
      expires_in: 86400,
      transaction: {
        recipientPhone: 'REDACTED',
        recipientEmail: 'REDACTED',
        customIdentifier: '0xabc',
        cards: [{ cardNumber: 0, pinCode: 'REDACTED' }],
      },
    });
  });

  it('redacts a whole object stored under a sensitive key', () => {
    expect(scrub({ recipientPhone: { countryCode: 'NG', number: '08012345678' } })).toEqual({
      recipientPhone: { countryCode: 'REDACTED', number: 'REDACTED' },
    });
  });

  it('keeps non-sensitive fields that only look similar', () => {
    const input = { countryCode: 'NG', currencyCode: 'USD', errorCode: null, operatorId: 341 };
    expect(scrub(input)).toEqual(input);
  });

  it('removes e-mail addresses that appear inside free text', () => {
    expect(scrub({ message: 'Sent to buyer@mail.test today' })).toEqual({
      message: 'Sent to REDACTED@example.com today',
    });
  });

  it('leaves no trace of the original secrets in the output', () => {
    const out = JSON.stringify(scrub({ token: 'tok_live_123', list: [{ email: 'a@b.co' }] }));
    expect(out).not.toContain('tok_live_123');
    expect(out).not.toContain('a@b.co');
  });
});

describe('redactAll', () => {
  it('hides every value of a card response, whatever the field names are', () => {
    // The official spec names the PIN field `amount`; the real name is unknown.
    const cards = [{ cardNumber: 6120200345149064, amount: 5821, redeemCode: 'ABCD-1234' }];
    expect(redactAll(cards)).toEqual([{ cardNumber: 0, amount: 0, redeemCode: 'REDACTED' }]);
    const out = JSON.stringify(redactAll(cards));
    expect(out).not.toContain('5821');
    expect(out).not.toContain('ABCD-1234');
  });

  it('scrub also hides a whole pinDetail object', () => {
    expect(scrub({ pinDetail: { serial: 'S1', info1: 'dial *123#', value: 100 } })).toEqual({
      pinDetail: { serial: 'REDACTED', info1: 'REDACTED', value: 0 },
    });
  });
});

describe('sandbox guard', () => {
  it('accepts only the sandbox hosts', () => {
    expect(isSandboxUrl(reloadlyBaseUrl('sandbox', 'topups'))).toBe(true);
    expect(isSandboxUrl(reloadlyBaseUrl('sandbox', 'giftcards'))).toBe(true);
    expect(isSandboxUrl(reloadlyBaseUrl('live', 'topups'))).toBe(false);
    expect(isSandboxUrl(reloadlyBaseUrl('live', 'giftcards'))).toBe(false);
    expect(isSandboxUrl('https://topups-sandbox.reloadly.com.evil.test/x')).toBe(false);
  });
});
