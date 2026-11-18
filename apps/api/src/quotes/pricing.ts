import { addBpsUp, ceilDiv, formatUnitsPlain, parseUnitsStrict } from '../money';
import type { GiftCardProduct, Operator } from '../supplier/types';

/** Pure pricing rules, kept apart from I/O so they are easy to test and to explain. */

export class QuoteError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 400,
  ) {
    super(message);
    this.name = 'QuoteError';
  }
}

export interface ProductPrice {
  supplierCostUsd6: bigint;
  supplierAmount: string;
  faceValue: string;
  faceCurrency: string;
  productName: string;
}

/** Airtime: the amount is in the operator's sender currency, which must be USD. */
export function priceAirtime(operator: Operator, amount: string): ProductPrice {
  if (operator.senderCurrency !== 'USD') {
    throw new QuoteError(
      'unsupported_currency',
      `operator is priced in ${operator.senderCurrency}`,
    );
  }
  const amount6 = parseUnitsStrict(amount, 6);
  if (amount6 <= 0n) throw new QuoteError('invalid_amount', 'amount must be positive');
  if (operator.denominationType === 'FIXED') {
    if (!operator.fixedAmounts.some((fixed) => parseUnitsStrict(fixed, 6) === amount6)) {
      throw new QuoteError('invalid_amount', 'amount is not one of the operator fixed amounts');
    }
  } else {
    const min = operator.minAmount ? parseUnitsStrict(operator.minAmount, 6) : 0n;
    const max = operator.maxAmount ? parseUnitsStrict(operator.maxAmount, 6) : 0n;
    if (amount6 < min || (max > 0n && amount6 > max)) {
      throw new QuoteError(
        'invalid_amount',
        `amount must be between ${operator.minAmount} and ${operator.maxAmount}`,
      );
    }
  }
  // Estimated local value, for display only.
  const fx6 = operator.fxRate ? parseUnitsStrict(operator.fxRate.toFixed(6), 6) : null;
  const face = fx6
    ? formatUnitsPlain(((amount6 * fx6) / 1_000_000n / 10_000n) * 10_000n, 6)
    : amount;
  return {
    // The supplier's discount is not subtracted: the cost is never under-estimated.
    supplierCostUsd6: amount6,
    supplierAmount: formatUnitsPlain(amount6, 6),
    faceValue: face,
    faceCurrency: fx6 ? operator.destinationCurrency : operator.senderCurrency,
    productName: operator.name,
  };
}

/** Gift card: `unitPrice` is the face value; cost = sender price + sender fee. */
export function priceGiftCard(product: GiftCardProduct, unitPrice: string): ProductPrice {
  if (product.senderCurrency !== 'USD') {
    throw new QuoteError('unsupported_currency', `product is priced in ${product.senderCurrency}`);
  }
  const wanted = parseUnitsStrict(unitPrice, 6);
  const denomination = product.denominations.find(
    (item) => parseUnitsStrict(item.recipient, 6) === wanted,
  );
  if (!denomination) throw new QuoteError('invalid_amount', 'not a denomination of this product');
  return {
    supplierCostUsd6:
      parseUnitsStrict(denomination.sender, 6) + parseUnitsStrict(product.senderFee, 6),
    supplierAmount: denomination.recipient,
    faceValue: denomination.recipient,
    faceCurrency: product.recipientCurrency,
    productName: product.name,
  };
}

/** What the user pays in USD: supplier cost plus margin, rounded up. */
export function usdPrice(supplierCostUsd6: bigint, marginBps: bigint): bigint {
  return addBpsUp(supplierCostUsd6, marginBps);
}

/** QIE (18 decimals) for a USD amount at `priceUsd6` per QIE, plus the spread; rounded up. */
export function qieAmount(usd6: bigint, priceUsd6: bigint, spreadBps: bigint): bigint {
  if (priceUsd6 <= 0n) throw new QuoteError('qie_price_unavailable', 'no QIE price', 503);
  return addBpsUp(ceilDiv(usd6 * 10n ** 18n, priceUsd6), spreadBps);
}
