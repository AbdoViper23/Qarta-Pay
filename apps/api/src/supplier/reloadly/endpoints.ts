/**
 * Reloadly hosts. One OAuth token per product; the `audience` selects product and
 * environment (docs/08-RELOADLY-REFERENCE.md).
 */
export const RELOADLY_AUTH_URL = 'https://auth.reloadly.com/oauth/token';

export type ReloadlyEnv = 'sandbox' | 'live';
export type ReloadlyProduct = 'topups' | 'giftcards';

const BASE_URLS: Record<ReloadlyEnv, Record<ReloadlyProduct, string>> = {
  sandbox: {
    topups: 'https://topups-sandbox.reloadly.com',
    giftcards: 'https://giftcards-sandbox.reloadly.com',
  },
  live: {
    topups: 'https://topups.reloadly.com',
    giftcards: 'https://giftcards.reloadly.com',
  },
};

const ACCEPT_HEADERS: Record<ReloadlyProduct, string> = {
  topups: 'application/com.reloadly.topups-v1+json',
  giftcards: 'application/com.reloadly.giftcards-v1+json',
};

/** Base URL of a product. It is also the OAuth `audience` for that product. */
export function reloadlyBaseUrl(env: ReloadlyEnv, product: ReloadlyProduct): string {
  return BASE_URLS[env][product];
}

export function reloadlyAcceptHeader(product: ReloadlyProduct): string {
  return ACCEPT_HEADERS[product];
}

/** True only for the two sandbox hosts. Scripts the agent runs must check this before any call. */
export function isSandboxUrl(url: string): boolean {
  const host = new URL(url).host;
  return host === 'topups-sandbox.reloadly.com' || host === 'giftcards-sandbox.reloadly.com';
}
