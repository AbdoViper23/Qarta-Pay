import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { friendlyError } from './errors';

describe('friendlyError', () => {
  it('maps API error codes', () => {
    expect(friendlyError(new ApiError('qie_price_unavailable', 'x', 503))).toMatch(
      /Pay with QUSDC/,
    );
  });

  it('names the per-order limit and says it is temporary', () => {
    expect(friendlyError(new ApiError('limit_order', 'orders are limited to $50', 400))).toBe(
      'For now, orders are limited to $50 each. This is a temporary limit and we will lift it soon. Please choose a smaller amount.',
    );
  });

  it('maps contract custom errors found anywhere in the cause chain', () => {
    const error = {
      shortMessage: 'execution reverted',
      cause: { data: { errorName: 'QuoteExpired' } },
    };
    expect(friendlyError(error)).toBe('Price expired. Get a new price.');
  });

  it('recognises a cancelled signature and never echoes raw text', () => {
    expect(friendlyError(new Error('User rejected the request.'))).toBe(
      'You cancelled in your wallet.',
    );
    expect(friendlyError(new Error('0xdeadbeef internal'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
