import { z } from 'zod';
import type { CardCode } from '../../codes';
import { formatUnitsPlain, numberToUnits } from '../../money';
import {
  SupplierRejectedError,
  type DeliveryRef,
  type DeliveryStatus,
  type GiftCardProduct,
  type Operator,
  type Supplier,
} from '../types';
import {
  RELOADLY_AUTH_URL,
  reloadlyAcceptHeader,
  reloadlyBaseUrl,
  type ReloadlyEnv,
  type ReloadlyProduct,
} from './endpoints';

/**
 * Reloadly client (docs/08-RELOADLY-REFERENCE.md). Endpoints come from Reloadly's official
 * OpenAPI repos. Response schemas are loose (`z.looseObject`) and only the fields we use are
 * required. They are checked against real sandbox responses in `test/fixtures/reloadly`
 * (fixtures.test.ts).
 */

const num = z.union([
  z.number(),
  z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .transform(Number),
]);

const operatorSchema = z.looseObject({
  operatorId: z.number(),
  name: z.string(),
  denominationType: z.enum(['FIXED', 'RANGE']),
  senderCurrencyCode: z.string(),
  destinationCurrencyCode: z.string(),
  minAmount: num.nullish(),
  maxAmount: num.nullish(),
  fixedAmounts: z.array(num).nullish(),
  fx: z.looseObject({ rate: num.nullish() }).nullish(),
  logoUrls: z.array(z.string()).nullish(),
  country: z.looseObject({ isoName: z.string() }).nullish(),
});

const productSchema = z.looseObject({
  productId: z.number(),
  productName: z.string(),
  denominationType: z.string(),
  recipientCurrencyCode: z.string(),
  senderCurrencyCode: z.string(),
  senderFee: num.nullish(),
  fixedRecipientToSenderDenominationsMap: z.record(z.string(), num).nullish(),
  logoUrls: z.array(z.string()).nullish(),
  brand: z.looseObject({ brandName: z.string() }).nullish(),
  country: z.looseObject({ isoName: z.string() }).nullish(),
  redeemInstruction: z.looseObject({ concise: z.string().nullish() }).nullish(),
});

const transactionIdSchema = z.looseObject({ transactionId: z.union([z.number(), z.string()]) });

/** Airtime status: flat in the official spec, nested in a blog example. Accept both. */
const topupStatusSchema = z.looseObject({
  status: z.string().optional(),
  transactionId: z.union([z.number(), z.string()]).optional(),
  transaction: z.looseObject({ status: z.string().optional() }).nullish(),
});

const giftOrderSchema = z.looseObject({
  transactionId: z.union([z.number(), z.string()]),
  status: z.string().optional(),
  customIdentifier: z.string().nullish(),
});

const pageSchema = <T extends z.ZodType>(item: T) =>
  z.looseObject({
    content: z.array(item),
    last: z.boolean().optional(),
    totalPages: z.number().optional(),
  });

const cardSchema = z.looseObject({
  cardNumber: z.union([z.string(), z.number()]).nullish(),
  pinCode: z.union([z.string(), z.number()]).nullish(),
  redemptionUrl: z.string().nullish(),
});

const balanceSchema = z.looseObject({ balance: num, currencyCode: z.string() });

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

function toStatus(value: string | null | undefined): DeliveryStatus {
  switch ((value ?? '').toUpperCase()) {
    case 'SUCCESSFUL':
      return 'SUCCESSFUL';
    case 'PROCESSING':
    case 'PENDING':
      return 'PROCESSING';
    case 'REFUNDED':
      return 'REFUNDED';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'UNKNOWN';
  }
}

function units(value: number): string {
  return formatUnitsPlain(numberToUnits(value, 6), 6);
}

function toOperator(raw: z.infer<typeof operatorSchema>, countryCode: string): Operator {
  return {
    operatorId: raw.operatorId,
    name: raw.name,
    countryCode: raw.country?.isoName ?? countryCode,
    denominationType: raw.denominationType,
    senderCurrency: raw.senderCurrencyCode,
    destinationCurrency: raw.destinationCurrencyCode,
    fxRate: raw.fx?.rate ?? null,
    fixedAmounts: (raw.fixedAmounts ?? []).map(units),
    minAmount: raw.minAmount == null ? null : units(raw.minAmount),
    maxAmount: raw.maxAmount == null ? null : units(raw.maxAmount),
    logoUrl: raw.logoUrls?.[0] ?? null,
  };
}

function toProduct(raw: z.infer<typeof productSchema>): GiftCardProduct {
  const map = raw.fixedRecipientToSenderDenominationsMap ?? {};
  return {
    productId: raw.productId,
    name: raw.productName,
    brandName: raw.brand?.brandName ?? raw.productName,
    countryCode: raw.country?.isoName ?? '',
    recipientCurrency: raw.recipientCurrencyCode,
    senderCurrency: raw.senderCurrencyCode,
    senderFee: units(raw.senderFee ?? 0),
    denominations:
      raw.denominationType === 'FIXED'
        ? Object.entries(map).map(([recipient, sender]) => ({
            recipient: units(Number(recipient)),
            sender: units(sender),
          }))
        : [], // RANGE products are not sold until their behaviour is confirmed in sandbox
    logoUrl: raw.logoUrls?.[0] ?? null,
    redeemInstructions: raw.redeemInstruction?.concise ?? null,
  };
}

export interface ReloadlyOptions {
  env: ReloadlyEnv;
  clientId: string;
  clientSecret: string;
  orderEmail: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class ReloadlySupplier implements Supplier {
  readonly name = 'reloadly';
  private readonly tokens = new Map<ReloadlyProduct, { value: string; expiresAt: number }>();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ReloadlyOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  // ------------------------------------------------------------------ http

  private async token(product: ReloadlyProduct, refresh = false): Promise<string> {
    const cached = this.tokens.get(product);
    if (!refresh && cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
    const response = await this.fetchImpl(RELOADLY_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        grant_type: 'client_credentials',
        audience: reloadlyBaseUrl(this.options.env, product),
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
    });
    if (!response.ok) throw new Error(`reloadly auth failed: HTTP ${response.status}`);
    const parsed = tokenSchema.parse(await response.json());
    this.tokens.set(product, {
      value: parsed.access_token,
      expiresAt: Date.now() + parsed.expires_in * 1000,
    });
    return parsed.access_token;
  }

  /**
   * Sends one request. A 4xx other than 401/404/408/429 means Reloadly refused the request
   * (SupplierRejectedError); everything else that is not 2xx is an unknown outcome.
   */
  private async request(
    product: ReloadlyProduct,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    retried = false,
  ): Promise<unknown> {
    const response = await this.fetchImpl(`${reloadlyBaseUrl(this.options.env, product)}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.token(product, retried)}`,
        Accept: reloadlyAcceptHeader(product),
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
    });
    if (response.status === 401 && !retried) return this.request(product, method, path, body, true);
    const text = await response.text();
    const json: unknown = text ? JSON.parse(text) : null;
    if (response.ok) return json;
    const message =
      typeof json === 'object' && json !== null && 'message' in json
        ? String(json.message)
        : `HTTP ${response.status}`;
    const errorCode =
      typeof json === 'object' && json !== null && 'errorCode' in json
        ? String(json.errorCode)
        : '';
    // A reused customIdentifier means the order already exists at Reloadly (sandbox answers
    // 400 CUSTOM_IDENTIFIER_ALREADY_USED, 21 Nov 2026). That is not a rejection: treating it as
    // one would refund an order that may have been delivered. It stays an unknown outcome, so
    // the worker looks the order up and, failing that, marks it NEEDS_REVIEW.
    if (errorCode.startsWith('CUSTOM_IDENTIFIER')) {
      const error = new Error(`reloadly ${method} ${path}: ${errorCode}`) as Error & {
        status: number;
      };
      error.status = response.status;
      throw error;
    }
    if (
      response.status >= 400 &&
      response.status < 500 &&
      ![401, 404, 408, 429].includes(response.status)
    ) {
      throw new SupplierRejectedError(`reloadly ${method} ${path}: ${message}`);
    }
    const error = new Error(`reloadly ${method} ${path}: ${message}`) as Error & { status: number };
    error.status = response.status;
    throw error;
  }

  // --------------------------------------------------------------- account

  async balanceUsd6(): Promise<bigint> {
    const balance = balanceSchema.parse(await this.request('topups', 'GET', '/accounts/balance'));
    if (balance.currencyCode !== 'USD')
      throw new Error(`supplier balance is in ${balance.currencyCode}, not USD`);
    return numberToUnits(balance.balance, 6);
  }

  // --------------------------------------------------------------- airtime

  async detectOperator(phone: string, countryCode: string): Promise<Operator | null> {
    try {
      const raw = await this.request(
        'topups',
        'GET',
        `/operators/auto-detect/phone/${encodeURIComponent(phone)}/countries/${countryCode}?suggestedAmounts=true`,
      );
      return toOperator(operatorSchema.parse(raw), countryCode);
    } catch (error) {
      if (error instanceof SupplierRejectedError || (error as { status?: number }).status === 404)
        return null;
      throw error;
    }
  }

  async getOperator(operatorId: number): Promise<Operator> {
    return toOperator(
      operatorSchema.parse(await this.request('topups', 'GET', `/operators/${operatorId}`)),
      '',
    );
  }

  async sendTopup(input: {
    customIdentifier: string;
    operatorId: number;
    amount: string;
    countryCode: string;
    phone: string;
  }): Promise<DeliveryRef> {
    const raw = await this.request('topups', 'POST', '/topups-async', {
      operatorId: input.operatorId,
      amount: input.amount,
      useLocalAmount: false,
      customIdentifier: input.customIdentifier,
      recipientPhone: { countryCode: input.countryCode, number: input.phone },
    });
    return {
      transactionId: String(transactionIdSchema.parse(raw).transactionId),
      status: 'PROCESSING',
    };
  }

  async getTopup(transactionId: string): Promise<DeliveryRef> {
    const raw = topupStatusSchema.parse(
      await this.request('topups', 'GET', `/topups/${transactionId}/status`),
    );
    return { transactionId, status: toStatus(raw.status ?? raw.transaction?.status) };
  }

  async findTopup(customIdentifier: string): Promise<DeliveryRef | null> {
    // The official spec lists customIdentifier as a filter of this report.
    const raw = await this.request(
      'topups',
      'GET',
      `/topups/reports/transactions?size=20&page=1&customIdentifier=${encodeURIComponent(customIdentifier)}`,
    );
    const page = pageSchema(
      z.looseObject({
        transactionId: z.union([z.number(), z.string()]),
        status: z.string(),
        customIdentifier: z.string().nullish(),
      }),
    ).parse(raw);
    const match = page.content.find((item) => item.customIdentifier === customIdentifier);
    return match
      ? { transactionId: String(match.transactionId), status: toStatus(match.status) }
      : null;
  }

  // ------------------------------------------------------------ gift cards

  async listGiftCards(countryCode: string): Promise<GiftCardProduct[]> {
    const raw = await this.request('giftcards', 'GET', `/countries/${countryCode}/products`);
    return z.array(productSchema).parse(raw).map(toProduct);
  }

  async getGiftCard(productId: number): Promise<GiftCardProduct> {
    return toProduct(
      productSchema.parse(await this.request('giftcards', 'GET', `/products/${productId}`)),
    );
  }

  async orderGiftCard(input: {
    customIdentifier: string;
    productId: number;
    countryCode: string;
    unitPrice: string;
  }): Promise<DeliveryRef> {
    const raw = giftOrderSchema.parse(
      await this.request('giftcards', 'POST', '/orders', {
        productId: input.productId,
        countryCode: input.countryCode,
        quantity: 1,
        unitPrice: Number(input.unitPrice),
        customIdentifier: input.customIdentifier,
        senderName: 'Qarta Pay',
        recipientEmail: this.options.orderEmail,
      }),
    );
    return { transactionId: String(raw.transactionId), status: toStatus(raw.status) };
  }

  async getGiftCardOrder(transactionId: string): Promise<DeliveryRef> {
    const raw = giftOrderSchema.parse(
      await this.request('giftcards', 'GET', `/reports/transactions/${transactionId}`),
    );
    return { transactionId, status: toStatus(raw.status) };
  }

  async findGiftCardOrder(customIdentifier: string, since: Date): Promise<DeliveryRef | null> {
    // This report cannot be filtered by customIdentifier, so page through recent orders.
    const start = since.toISOString().slice(0, 19).replace('T', ' ');
    for (let page = 1; page <= 10; page += 1) {
      const raw = await this.request(
        'giftcards',
        'GET',
        `/reports/transactions?size=200&page=${page}&startDate=${encodeURIComponent(start)}`,
      );
      const parsed = pageSchema(giftOrderSchema).parse(raw);
      const match = parsed.content.find((item) => item.customIdentifier === customIdentifier);
      if (match)
        return { transactionId: String(match.transactionId), status: toStatus(match.status) };
      if (parsed.last !== false || parsed.content.length === 0) break;
    }
    return null;
  }

  async getCardCodes(transactionId: string): Promise<CardCode[]> {
    const raw = z
      .array(cardSchema)
      .parse(await this.request('giftcards', 'GET', `/orders/transactions/${transactionId}/cards`));
    const codes = raw.map((card) => {
      const code = card.cardNumber ?? card.redemptionUrl;
      if (code == null || String(code) === '') throw new Error('card response has no code field');
      return { code: String(code), pin: card.pinCode == null ? null : String(card.pinCode) };
    });
    if (codes.length === 0) throw new Error('card response is empty');
    return codes;
  }
}
