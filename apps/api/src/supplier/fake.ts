import type { CardCode } from '../codes';
import {
  SupplierRejectedError,
  type DeliveryRef,
  type DeliveryStatus,
  type GiftCardProduct,
  type Operator,
  type Supplier,
} from './types';

/**
 * In-memory supplier for tests and for running the whole app locally without Reloadly
 * credentials. Refused on mainnet (see main.ts). Outcomes are chosen by the input:
 *   phone ending 0000  -> top-up REFUNDED     phone ending 1111 -> stays PROCESSING
 *   phone ending 2222  -> request rejected    phone ending 3333 -> network error after the call
 *   gift card product 9999 -> order FAILED    everything else    -> SUCCESSFUL
 */
export class FakeSupplier implements Supplier {
  readonly name = 'fake';
  balance = 1_000_000_000n; // $1,000
  readonly calls: { method: string; customIdentifier?: string }[] = [];
  private readonly deliveries = new Map<
    string,
    { status: DeliveryStatus; customIdentifier: string; kind: string }
  >();
  private next = 1000;

  private readonly operators: Operator[] = [
    {
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
    },
    {
      operatorId: 646,
      name: 'Safaricom Kenya',
      countryCode: 'KE',
      denominationType: 'FIXED',
      senderCurrency: 'USD',
      destinationCurrency: 'KES',
      fxRate: 129,
      fixedAmounts: ['1', '2', '5', '10'],
      minAmount: null,
      maxAmount: null,
      logoUrl: null,
    },
  ];

  private readonly products: GiftCardProduct[] = [
    {
      productId: 5,
      name: 'Amazon US',
      brandName: 'Amazon',
      countryCode: 'US',
      recipientCurrency: 'USD',
      senderCurrency: 'USD',
      senderFee: '0.3',
      denominations: [
        { recipient: '5', sender: '5' },
        { recipient: '10', sender: '10' },
        { recipient: '25', sender: '25' },
      ],
      logoUrl: null,
      redeemInstructions: 'Redeem at amazon.com/redeem.',
    },
    {
      productId: 9999,
      name: 'Always Fails',
      brandName: 'Steam',
      countryCode: 'US',
      recipientCurrency: 'USD',
      senderCurrency: 'USD',
      senderFee: '0',
      denominations: [{ recipient: '5', sender: '5' }],
      logoUrl: null,
      redeemInstructions: null,
    },
  ];

  async balanceUsd6(): Promise<bigint> {
    return this.balance;
  }

  async detectOperator(phone: string, countryCode: string): Promise<Operator | null> {
    return (
      this.operators.find((operator) => operator.countryCode === countryCode && phone.length > 6) ??
      null
    );
  }

  async getOperator(operatorId: number): Promise<Operator> {
    const operator = this.operators.find((item) => item.operatorId === operatorId);
    if (!operator) throw new SupplierRejectedError(`unknown operator ${operatorId}`);
    return operator;
  }

  async sendTopup(input: {
    customIdentifier: string;
    phone: string;
    amount: string;
  }): Promise<DeliveryRef> {
    this.calls.push({ method: 'sendTopup', customIdentifier: input.customIdentifier });
    if (input.phone.endsWith('2222')) throw new SupplierRejectedError('invalid phone');
    if (this.find(input.customIdentifier))
      throw new SupplierRejectedError('customIdentifier already used');
    const status: DeliveryStatus = input.phone.endsWith('0000')
      ? 'REFUNDED'
      : input.phone.endsWith('1111')
        ? 'PROCESSING'
        : 'SUCCESSFUL';
    const id = this.store(input.customIdentifier, status, 'topup');
    if (input.phone.endsWith('3333')) throw new Error('socket hang up'); // delivered, but we never hear back
    return { transactionId: id, status: 'PROCESSING' };
  }

  async getTopup(transactionId: string): Promise<DeliveryRef> {
    return this.read(transactionId);
  }

  async findTopup(customIdentifier: string): Promise<DeliveryRef | null> {
    this.calls.push({ method: 'findTopup', customIdentifier });
    return this.find(customIdentifier);
  }

  async listCountries(product: 'airtime' | 'giftcards'): Promise<string[]> {
    const items = product === 'airtime' ? this.operators : this.products;
    return [...new Set(items.map((item) => item.countryCode))];
  }

  async listGiftCards(countryCode: string): Promise<GiftCardProduct[]> {
    return this.products.filter((product) => product.countryCode === countryCode);
  }

  async getGiftCard(productId: number): Promise<GiftCardProduct> {
    const product = this.products.find((item) => item.productId === productId);
    if (!product) throw new SupplierRejectedError(`unknown product ${productId}`);
    return product;
  }

  async orderGiftCard(input: {
    customIdentifier: string;
    productId: number;
  }): Promise<DeliveryRef> {
    this.calls.push({ method: 'orderGiftCard', customIdentifier: input.customIdentifier });
    if (this.find(input.customIdentifier))
      throw new SupplierRejectedError('customIdentifier already used');
    const status: DeliveryStatus = input.productId === 9999 ? 'REFUNDED' : 'SUCCESSFUL';
    const id = this.store(input.customIdentifier, status, 'giftcard');
    return { transactionId: id, status };
  }

  async getGiftCardOrder(transactionId: string): Promise<DeliveryRef> {
    return this.read(transactionId);
  }

  async findGiftCardOrder(customIdentifier: string): Promise<DeliveryRef | null> {
    this.calls.push({ method: 'findGiftCardOrder', customIdentifier });
    return this.find(customIdentifier);
  }

  async getCardCodes(transactionId: string): Promise<CardCode[]> {
    return [{ code: `FAKE-${transactionId}-CODE`, pin: '1234' }];
  }

  /** Test helper: change what the supplier reports for a delivery. */
  setStatus(transactionId: string, status: DeliveryStatus): void {
    const delivery = this.deliveries.get(transactionId);
    if (delivery) delivery.status = status;
  }

  private store(customIdentifier: string, status: DeliveryStatus, kind: string): string {
    const id = String(this.next++);
    this.deliveries.set(id, { status, customIdentifier, kind });
    return id;
  }

  private read(transactionId: string): DeliveryRef {
    const delivery = this.deliveries.get(transactionId);
    if (!delivery) throw new Error(`unknown transaction ${transactionId}`);
    return { transactionId, status: delivery.status };
  }

  private find(customIdentifier: string): DeliveryRef | null {
    for (const [transactionId, delivery] of this.deliveries) {
      if (delivery.customIdentifier === customIdentifier)
        return { transactionId, status: delivery.status };
    }
    return null;
  }
}
