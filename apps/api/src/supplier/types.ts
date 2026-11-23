import type { CardCode } from '../codes';

/**
 * What the backend needs from a delivery supplier. Reloadly implements it today; a second
 * supplier (Bitrefill Business, DingConnect) would implement the same interface.
 * Amounts are decimal strings in the supplier account currency (USD) unless named otherwise.
 */

/** Outcome of a delivery as far as the supplier says. */
export type DeliveryStatus = 'SUCCESSFUL' | 'PROCESSING' | 'REFUNDED' | 'FAILED' | 'UNKNOWN';

export interface Operator {
  operatorId: number;
  name: string;
  countryCode: string;
  denominationType: 'FIXED' | 'RANGE';
  senderCurrency: string;
  destinationCurrency: string;
  /** Destination currency units per 1 sender currency unit, when the supplier gives one. */
  fxRate: number | null;
  fixedAmounts: string[];
  minAmount: string | null;
  maxAmount: string | null;
  logoUrl: string | null;
}

export interface GiftCardDenomination {
  /** Face value in the card's currency. */
  recipient: string;
  /** What the supplier charges us, in the account currency, before fees. */
  sender: string;
}

export interface GiftCardProduct {
  productId: number;
  name: string;
  brandName: string;
  countryCode: string;
  recipientCurrency: string;
  senderCurrency: string;
  senderFee: string;
  denominations: GiftCardDenomination[];
  logoUrl: string | null;
  redeemInstructions: string | null;
}

export interface DeliveryRef {
  transactionId: string;
  status: DeliveryStatus;
}

export interface Supplier {
  readonly name: string;
  /** Prepaid balance in USD, 6 decimals. */
  balanceUsd6(): Promise<bigint>;

  /** ISO 3166-1 alpha-2 codes of the countries the supplier serves for this product. */
  listCountries(product: 'airtime' | 'giftcards'): Promise<string[]>;
  detectOperator(phone: string, countryCode: string): Promise<Operator | null>;
  getOperator(operatorId: number): Promise<Operator>;
  sendTopup(input: {
    customIdentifier: string;
    operatorId: number;
    amount: string;
    countryCode: string;
    phone: string;
  }): Promise<DeliveryRef>;
  getTopup(transactionId: string): Promise<DeliveryRef>;
  /** Looks a top-up up by our reference; null if the supplier has no such top-up. */
  findTopup(customIdentifier: string, since: Date): Promise<DeliveryRef | null>;

  listGiftCards(countryCode: string): Promise<GiftCardProduct[]>;
  getGiftCard(productId: number): Promise<GiftCardProduct>;
  orderGiftCard(input: {
    customIdentifier: string;
    productId: number;
    countryCode: string;
    unitPrice: string;
  }): Promise<DeliveryRef>;
  getGiftCardOrder(transactionId: string): Promise<DeliveryRef>;
  findGiftCardOrder(customIdentifier: string, since: Date): Promise<DeliveryRef | null>;
  getCardCodes(transactionId: string): Promise<CardCode[]>;
}

/**
 * The supplier refused the request before doing anything (validation error, unknown product).
 * Only this error lets the worker refund without looking the order up first.
 * Any other error means the outcome is unknown.
 */
export class SupplierRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupplierRejectedError';
  }
}
