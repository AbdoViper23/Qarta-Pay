import { randomBytes } from 'node:crypto';
import { NATIVE_TOKEN, quoteDomain, quoteTypes, type Quote } from '@qarta/shared';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { getAddress, isAddress, toHex, type Account, type Address, type Hex } from 'viem';
import { z } from 'zod';
import type { Catalog } from '../catalog/catalog';
import { ContractLimitsError } from '../chain/contract-limits';
import type { AppConfig } from '../config';
import { freeOrdersUsed, insertOrder, supplierCostReserved, usdCommittedToday } from '../db/orders';
import type { Db } from '../db/pool';
import { formatUnitsPlain, parseUnitsStrict } from '../money';
import type { PriceService } from '../pricing/prices';
import type { Supplier } from '../supplier/types';
import {
  priceAirtime,
  priceGiftCard,
  qieAmount,
  QuoteError,
  usdPrice,
  type ProductPrice,
} from './pricing';

const walletAddress = z
  .string()
  .refine((value) => isAddress(value), 'not an address')
  .transform((value): Address => getAddress(value));
const decimal = z.string().regex(/^\d+(\.\d{1,6})?$/, 'decimal amount with at most 6 decimals');
const country = z.string().regex(/^[A-Z]{2}$/);

export const quoteRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('AIRTIME'),
    payer: walletAddress,
    payToken: z.enum(['QUSDC', 'QIE']),
    countryCode: country,
    recipientPhone: z.string().min(5).max(20),
    operatorId: z.number().int().positive(),
    amount: decimal,
  }),
  z.object({
    kind: z.literal('GIFT_CARD'),
    payer: walletAddress,
    payToken: z.enum(['QUSDC', 'QIE']),
    countryCode: country,
    productId: z.number().int().positive(),
    unitPrice: decimal,
    recipientWallet: walletAddress.optional(),
  }),
]);
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export interface QuoteResponse {
  orderId: Hex;
  quote: {
    orderId: Hex;
    payer: Address;
    token: Address;
    amount: string;
    usdAmount: string;
    expiry: string;
  };
  signature: Hex;
  expiresAt: string;
  checkout: Address;
  chainId: number;
  display: {
    usd: string;
    payAmount: string;
    payToken: 'QUSDC' | 'QIE';
    faceValue: string;
    faceCurrency: string;
    productName: string;
    recipient: string | null;
    /** What the product costs us at the supplier, in USD. */
    productUsd: string;
    /** Our fee in USD (`usd` = `productUsd` + `feeUsd`) and as a percent of the product cost. */
    feeUsd: string;
    feePercent: string;
    /** QIE payments only: the USD price per QIE used, and the extra QIE added for price moves. */
    qiePriceUsd: string | null;
    qieBufferPercent: string | null;
    /**
     * Free-order offer: no Qarta fee (`waivedFeeUsd` is what it would have been); `feeUsd` and
     * `feePercent` are then the payment costs passed on at cost.
     */
    freeOrder: boolean;
    waivedFeeUsd: string | null;
    /** Free orders the wallet still has before this one is paid, out of `freeOrdersTotal`. */
    freeOrdersLeft: number;
    freeOrdersTotal: number;
  };
}

/** Normalises a phone number for the supplier; throws a QuoteError if it is not valid there. */
export function normalisePhone(raw: string, countryCode: string): string {
  const parsed = parsePhoneNumberFromString(raw, countryCode as CountryCode);
  if (!parsed || !parsed.isValid() || parsed.country !== countryCode) {
    throw new QuoteError('invalid_phone', 'phone number is not valid for this country');
  }
  return parsed.number.replace('+', ''); // E.164 digits, e.g. 2348012345678
}

export class QuoteService {
  private balanceCache: { at: number; value: bigint } | null = null;

  constructor(
    private readonly db: Db,
    private readonly config: AppConfig,
    private readonly catalog: Catalog,
    private readonly supplier: Supplier,
    private readonly prices: PriceService,
    private readonly signer: Account,
    /** Resolves once the contract settings are known to agree with config; see contract-limits.ts. */
    private readonly contractLimits: () => Promise<unknown>,
  ) {}

  async create(request: QuoteRequest): Promise<QuoteResponse> {
    if (this.config.SALES_PAUSED) throw new QuoteError('sales_paused', 'sales are paused', 503);
    try {
      await this.contractLimits();
    } catch (error) {
      if (error instanceof ContractLimitsError) throw error;
      throw new QuoteError(
        'chain_unavailable',
        'the QIE network is not responding, try again',
        503,
      );
    }

    // 1. Product and supplier cost.
    let price: ProductPrice;
    let recipientPhone: string | null = null;
    let recipientWallet: Address = request.payer;
    if (request.kind === 'AIRTIME') {
      if (!(await this.catalog.isAirtimeCountry(request.countryCode))) {
        throw new QuoteError('country_not_enabled', 'airtime is not sold for this country');
      }
      recipientPhone = normalisePhone(request.recipientPhone, request.countryCode);
      const operator = await this.catalog.operator(request.operatorId);
      price = priceAirtime(operator, request.amount);
    } else {
      const product = await this.catalog.giftCard(request.productId, request.countryCode);
      if (!product)
        throw new QuoteError('product_not_available', 'this gift card is not sold here');
      price = priceGiftCard(product, request.unitPrice);
      recipientWallet = request.recipientWallet ?? request.payer;
    }

    // 2. Price in USD and limits. A wallet's first orders carry no fee (docs/05-BACKEND.md).
    const freeOrdersTotal = this.config.FREE_ORDERS_PER_WALLET;
    const freeOrdersLeft =
      freeOrdersTotal > 0
        ? Math.max(0, freeOrdersTotal - (await freeOrdersUsed(this.db, request.payer)))
        : 0;
    const feeWaived =
      freeOrdersLeft > 0 &&
      price.supplierCostUsd6 <= parseUnitsStrict(this.config.FREE_ORDER_MAX_USD.toFixed(6), 6);
    const usd6 = usdPrice(
      price.supplierCostUsd6,
      feeWaived ? this.config.FREE_ORDER_COST_BPS : this.config.MARGIN_BPS,
    );
    await this.checkLimits(request.payer, usd6);
    await this.checkSupplierBalance(price.supplierCostUsd6);

    // 3. Token amount.
    let token: Address;
    let amount: bigint;
    let ttl: number;
    let qiePriceUsd6: bigint | null = null;
    if (request.payToken === 'QUSDC') {
      token = this.config.addresses.qusdc;
      amount = usd6; // QUSDC has 6 decimals, 1:1 with USD
      ttl = this.config.QUOTE_TTL_QUSDC_S;
    } else {
      const snapshot = await this.prices.get();
      if (!snapshot.qie.enabled) {
        throw new QuoteError(
          'qie_price_unavailable',
          `QIE price check failed (${snapshot.qie.reason}); pay with QUSDC`,
          503,
        );
      }
      token = NATIVE_TOKEN;
      amount = qieAmount(usd6, snapshot.qie.priceUsd6, this.config.QIE_SPREAD_BPS);
      qiePriceUsd6 = snapshot.qie.priceUsd6;
      ttl = this.config.QUOTE_TTL_QIE_S;
    }

    // 4. Store the order, then sign.
    const orderId = toHex(randomBytes(32));
    const expiry = BigInt(Math.floor(Date.now() / 1000) + ttl);
    await insertOrder(this.db, {
      id: orderId,
      kind: request.kind,
      payer: request.payer,
      payToken: token,
      payAmount: amount,
      usdAmount: usd6,
      supplierCostUsd: price.supplierCostUsd6,
      quoteExpiry: new Date(Number(expiry) * 1000),
      countryCode: request.countryCode,
      operatorId: request.kind === 'AIRTIME' ? request.operatorId : null,
      productId: request.kind === 'GIFT_CARD' ? request.productId : null,
      recipientPhone,
      supplierAmount: price.supplierAmount,
      faceValue: price.faceValue,
      faceCurrency: price.faceCurrency,
      productName: price.productName,
      recipientWallet,
      feeWaived,
    });

    const quote: Quote = { orderId, payer: request.payer, token, amount, usdAmount: usd6, expiry };
    if (!this.signer.signTypedData) throw new Error('quote signer cannot sign typed data');
    const signature = await this.signer.signTypedData({
      domain: quoteDomain(this.config.CHAIN_ID, this.config.addresses.checkout),
      types: quoteTypes,
      primaryType: 'Quote',
      message: quote,
    });

    return {
      orderId,
      quote: {
        orderId,
        payer: request.payer,
        token,
        amount: amount.toString(),
        usdAmount: usd6.toString(),
        expiry: expiry.toString(),
      },
      signature,
      expiresAt: new Date(Number(expiry) * 1000).toISOString(),
      checkout: this.config.addresses.checkout,
      chainId: this.config.CHAIN_ID,
      display: {
        usd: formatUnitsPlain(usd6, 6),
        payAmount: formatUnitsPlain(amount, request.payToken === 'QUSDC' ? 6 : 18),
        payToken: request.payToken,
        faceValue: price.faceValue,
        faceCurrency: price.faceCurrency,
        productName: price.productName,
        recipient: request.kind === 'AIRTIME' ? `+${recipientPhone}` : recipientWallet,
        productUsd: formatUnitsPlain(price.supplierCostUsd6, 6),
        feeUsd: formatUnitsPlain(usd6 - price.supplierCostUsd6, 6),
        feePercent: formatUnitsPlain(
          feeWaived ? this.config.FREE_ORDER_COST_BPS : this.config.MARGIN_BPS,
          2,
        ),
        qiePriceUsd: qiePriceUsd6 === null ? null : formatUnitsPlain(qiePriceUsd6, 6),
        qieBufferPercent:
          qiePriceUsd6 === null ? null : formatUnitsPlain(this.config.QIE_SPREAD_BPS, 2),
        freeOrder: feeWaived,
        waivedFeeUsd: feeWaived
          ? formatUnitsPlain(
              usdPrice(price.supplierCostUsd6, this.config.MARGIN_BPS) - price.supplierCostUsd6,
              6,
            )
          : null,
        freeOrdersLeft,
        freeOrdersTotal,
      },
    };
  }

  private async checkLimits(payer: Address, usd6: bigint): Promise<void> {
    const max = (value: number) => parseUnitsStrict(value.toFixed(6), 6);
    if (usd6 > max(this.config.MAX_ORDER_USD)) {
      throw new QuoteError('limit_order', `orders are limited to $${this.config.MAX_ORDER_USD}`);
    }
    if ((await usdCommittedToday(this.db, payer)) + usd6 > max(this.config.MAX_WALLET_DAILY_USD)) {
      throw new QuoteError(
        'limit_wallet_daily',
        `daily limit of $${this.config.MAX_WALLET_DAILY_USD} per wallet reached`,
      );
    }
    if ((await usdCommittedToday(this.db)) + usd6 > max(this.config.MAX_GLOBAL_DAILY_USD)) {
      throw new QuoteError(
        'limit_global_daily',
        'daily sales limit reached, try again tomorrow',
        503,
      );
    }
  }

  /** Never sell what the supplier balance cannot deliver (docs/05-BACKEND.md step 5). */
  private async checkSupplierBalance(costUsd6: bigint): Promise<void> {
    if (!this.balanceCache || Date.now() - this.balanceCache.at > 30_000) {
      this.balanceCache = { at: Date.now(), value: await this.supplier.balanceUsd6() };
    }
    if (this.balanceCache.value < (await supplierCostReserved(this.db)) + costUsd6) {
      // The quote is refused before anyone pays. The exact balance is not disclosed.
      throw new QuoteError(
        'supplier_balance_low',
        'this amount is above what we can deliver right now; try a smaller amount',
        503,
      );
    }
  }
}
