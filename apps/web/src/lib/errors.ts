import { ApiError } from './api';

/**
 * Turns any error into one plain sentence with a next step. Raw errors are never shown
 * (docs/06-FRONTEND.md, UX rules).
 */
const CONTRACT_ERRORS: Record<string, string> = {
  QuoteExpired: 'Price expired. Get a new price.',
  WrongPayer: 'This price was made for another wallet. Get a new price.',
  OrderAlreadyExists: 'This order is already paid.',
  InvalidSignature: 'This price is not valid any more. Get a new price.',
  TokenNotAllowed: 'This token is not accepted. Pay with QUSDC or QIE.',
  WrongValue: 'The amount sent does not match the price. Get a new price.',
  EnforcedPause: 'Payments are paused right now. Please try again later.',
  PriceBelowOracle: 'The QIE price moved. Get a new price.',
  OracleStale: 'The QIE price feed is out of date. Pay with QUSDC.',
  OracleBadAnswer: 'The QIE price feed is unavailable. Pay with QUSDC.',
  RefundTimeoutNotReached: 'You can claim a refund only after the waiting time.',
  OrderNotPaid: 'This order is already settled or refunded.',
  NotPayer: 'Only the wallet that paid can claim this refund.',
  ERC20InsufficientBalance: 'Not enough QUSDC in your wallet.',
  ERC20InsufficientAllowance: 'Approve QUSDC first.',
};

const API_ERRORS: Record<string, string> = {
  qie_price_unavailable: 'QIE price check unavailable right now. Pay with QUSDC.',
  limit_order: 'This order is above the per-order limit.',
  limit_wallet_daily: 'You reached the daily limit for this wallet. Try again tomorrow.',
  limit_global_daily: 'Daily sales limit reached. Try again tomorrow.',
  sales_paused: 'Sales are paused right now. Please try again later.',
  temporarily_unavailable: 'Temporarily unavailable. Please try again in a few minutes.',
  supplier_balance_low:
    'We cannot deliver this amount right now. Try a smaller amount or come back later.',
  invalid_phone: 'That phone number does not look right for this country.',
  country_not_enabled: 'We do not sell top-ups for this country yet.',
  product_not_available: 'This gift card is not available right now.',
  invalid_amount: 'Choose one of the offered amounts.',
};

export function friendlyError(error: unknown): string {
  if (error instanceof ApiError) return API_ERRORS[error.code] ?? error.message;
  const text = collectText(error);
  if (/user (rejected|denied)|rejected the request|4001/i.test(text))
    return 'You cancelled in your wallet.';
  for (const [name, message] of Object.entries(CONTRACT_ERRORS)) {
    if (text.includes(name)) return message;
  }
  if (/insufficient funds/i.test(text))
    return 'Not enough QIE in your wallet to pay and cover the network fee.';
  if (/chain|network/i.test(text) && /mismatch|wrong|switch/i.test(text))
    return 'Switch your wallet to the QIE network.';
  if (/fetch|network ?error|failed to fetch/i.test(text))
    return 'Cannot reach Qarta Pay right now. Check your connection.';
  return 'Something went wrong. Please try again.';
}

function collectText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 6; depth += 1) {
    const e = current as {
      name?: string;
      message?: string;
      shortMessage?: string;
      data?: { errorName?: string };
      cause?: unknown;
    };
    parts.push(e.name ?? '', e.shortMessage ?? '', e.message ?? '', e.data?.errorName ?? '');
    current = e.cause;
  }
  return parts.join(' ');
}
