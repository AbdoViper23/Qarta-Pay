import { describe, expect, it } from 'vitest';
import type { GiftCardProduct, Operator } from '../supplier/types';
import { priceAirtime, priceGiftCard, qieAmount, usdPrice } from './pricing';

const range: Operator = {
  operatorId: 341,
  name: 'MTN Nigeria',
  countryCode: 'NG',
  denominationType: 'RANGE',
  senderCurrency: 'USD',
  destinationCurrency: 'NGN',
  fxRate: 1500,
  fixedAmounts: [],
  minAmount: '0.5',
  maxAmount: '50',
  logoUrl: null,
};
const fixed: Operator = {
  ...range,
  denominationType: 'FIXED',
  fixedAmounts: ['1', '5'],
  minAmount: null,
  maxAmount: null,
};
const card: GiftCardProduct = {
  productId: 5,
  name: 'Amazon US',
  brandName: 'Amazon',
  countryCode: 'US',
  recipientCurrency: 'USD',
  senderCurrency: 'USD',
  senderFee: '0.3',
  denominations: [{ recipient: '10', sender: '10' }],
  logoUrl: null,
  redeemInstructions: null,
  global: false,
};

describe('pricing', () => {
  it('prices a range airtime amount at cost and shows the local value', () => {
    expect(priceAirtime(range, '10')).toEqual({
      supplierCostUsd6: 10_000_000n,
      supplierAmount: '10',
      faceValue: '15000',
      faceCurrency: 'NGN',
      productName: 'MTN Nigeria',
    });
  });

  it('enforces range bounds and fixed amounts', () => {
    expect(() => priceAirtime(range, '0.4')).toThrow('between');
    expect(() => priceAirtime(range, '50.01')).toThrow('between');
    expect(() => priceAirtime(fixed, '2')).toThrow('fixed amounts');
    expect(priceAirtime(fixed, '5').supplierCostUsd6).toBe(5_000_000n);
  });

  it('refuses operators not priced in USD', () => {
    expect(() => priceAirtime({ ...range, senderCurrency: 'EUR' }, '10')).toThrow('EUR');
  });

  it('prices a gift card at sender price plus fee', () => {
    expect(priceGiftCard(card, '10').supplierCostUsd6).toBe(10_300_000n);
    expect(() => priceGiftCard(card, '7')).toThrow('denomination');
  });

  it('adds the margin and rounds up', () => {
    expect(usdPrice(10_300_000n, 400n)).toBe(10_712_000n);
    expect(usdPrice(1n, 400n)).toBe(2n);
  });

  it('converts USD to QIE with the spread, rounding up', () => {
    // $10 at $0.146976 = 68.0383... QIE, + 1.5% spread.
    const amount = qieAmount(10_000_000n, 146_976n, 150n);
    const exact = (10_000_000n * 10n ** 18n) / 146_976n;
    expect(amount).toBeGreaterThan(exact);
    expect(amount).toBe(
      (((10_000_000n * 10n ** 18n - 1n) / 146_976n + 1n) * 10_150n - 1n) / 10_000n + 1n,
    );
    // Paying the quote at the oracle price still clears the contract guard's floor.
    expect((amount * 146_976n) / 10n ** 18n).toBeGreaterThanOrEqual(10_000_000n);
  });
});
