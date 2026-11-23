import type { Address, Hex } from 'viem';
import { env } from './env';

/** Typed calls to the Qarta Pay API (apps/api). */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const response = await fetch(`${env.apiUrl}${path}`, { ...init, headers, cache: 'no-store' });
  const json = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!response.ok)
    throw new ApiError(
      json.error ?? 'error',
      json.message ?? `HTTP ${response.status}`,
      response.status,
    );
  return json as T;
}

export interface AppConfigResponse {
  chainId: number;
  explorerUrl: string;
  salesPaused: boolean;
  contracts: {
    checkout: Address;
    qusdc: Address;
    qieUsdFeed: Address | null;
    qiedexPair: Address | null;
    wqie: Address | null;
    qieReverseResolver: Address | null;
    qieNameRegistryB: Address | null;
  };
  airtimeCountries: string[];
  giftCardCountries: string[];
  limits: {
    maxOrderUsd: number;
    maxWalletDailyUsd: number;
    quoteTtlQusdcS: number;
    quoteTtlQieS: number;
  };
}

export interface PricesResponse {
  oracle: { priceUsd: string; updatedAt: string; ageSeconds: number } | null;
  pool: { priceUsd: string; reserveQusdc: string; reserveQie: string } | null;
  deviationBps: string | null;
  qieQuotesEnabled: boolean;
  qiePriceUsd: string | null;
  reason: string | null;
}

export interface Operator {
  operatorId: number;
  name: string;
  countryCode: string;
  denominationType: 'FIXED' | 'RANGE';
  senderCurrency: string;
  destinationCurrency: string;
  fxRate: number | null;
  fixedAmounts: string[];
  minAmount: string | null;
  maxAmount: string | null;
  logoUrl: string | null;
}

export interface GiftCardProduct {
  productId: number;
  name: string;
  brandName: string;
  countryCode: string;
  recipientCurrency: string;
  senderCurrency: string;
  senderFee: string;
  denominations: { recipient: string; sender: string }[];
  logoUrl: string | null;
  redeemInstructions: string | null;
  global: boolean;
}

export type PayToken = 'QUSDC' | 'QIE';

export type QuoteRequest =
  | {
      kind: 'AIRTIME';
      payer: Address;
      payToken: PayToken;
      countryCode: string;
      recipientPhone: string;
      operatorId: number;
      amount: string;
    }
  | {
      kind: 'GIFT_CARD';
      payer: Address;
      payToken: PayToken;
      countryCode: string;
      productId: number;
      unitPrice: string;
    };

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
    payToken: PayToken;
    faceValue: string;
    faceCurrency: string;
    productName: string;
    recipient: string | null;
  };
}

export type OrderStatus =
  | 'QUOTED'
  | 'EXPIRED'
  | 'PAID'
  | 'FULFILLING'
  | 'DELIVERED'
  | 'SETTLED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'NEEDS_REVIEW';

export interface OrderView {
  id: Hex;
  status: OrderStatus;
  kind: 'AIRTIME' | 'GIFT_CARD';
  payer: Address;
  payToken: PayToken;
  payAmount: string;
  usdAmount: string;
  productName: string;
  faceValue: string;
  faceCurrency: string;
  countryCode: string;
  recipient: string;
  hasCode: boolean;
  paidTxHash: Hex | null;
  settleTxHash: Hex | null;
  refundTxHash: Hex | null;
  refundedByPayer: boolean;
  quoteExpiry: string;
  paidAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface StatsResponse {
  ordersSettled: number;
  volumeUsd: string;
  uniquePayingWallets: number;
  repeatWallets: number;
  activeWallets7d: number;
  refundRate: number;
  medianDeliverySeconds: number | null;
  checkout: Address;
}

export const api = {
  config: () => call<AppConfigResponse>('/v1/config'),
  prices: () => call<PricesResponse>('/v1/prices'),
  identity: (wallet: Address) =>
    call<{ wallet: Address; qieName: string | null }>(`/v1/identity/${wallet}`),
  detect: (phone: string, country: string) =>
    call<{ operator: Operator | null; phoneE164?: string }>(
      `/v1/airtime/detect?phone=${encodeURIComponent(phone)}&country=${country}`,
    ),
  giftCards: (country: string) =>
    call<{ products: GiftCardProduct[] }>(`/v1/giftcards?country=${country}`),
  searchGiftCards: (q: string) =>
    call<{ products: GiftCardProduct[] }>(`/v1/giftcards/search?q=${encodeURIComponent(q)}`),
  quote: (body: QuoteRequest) =>
    call<QuoteResponse>('/v1/quotes', { method: 'POST', body: JSON.stringify(body) }),
  order: (id: string) => call<OrderView>(`/v1/orders/${id}`),
  orders: (token: string) =>
    call<{ wallet: Address; orders: OrderView[] }>('/v1/orders', { token }),
  code: (id: string, token: string) =>
    call<{ orderId: Hex; codes: { code: string; pin: string | null }[] }>(`/v1/orders/${id}/code`, {
      token,
    }),
  nonce: () => call<{ nonce: string }>('/v1/auth/nonce', { method: 'POST' }),
  verify: (message: string, signature: Hex) =>
    call<{ token: string; address: Address; expiresAt: string }>('/v1/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ message, signature }),
    }),
  stats: () => call<StatsResponse>('/v1/stats'),
};
