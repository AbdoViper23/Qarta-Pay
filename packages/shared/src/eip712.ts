import type { Address, Hex, TypedDataDomain } from 'viem';

/**
 * EIP-712 definitions for QartaCheckout quotes. They must match the contract exactly:
 * `QUOTE_TYPEHASH` and `EIP712("QartaCheckout", "1")` in contracts/src/QartaCheckout.sol.
 * A fixed test vector in eip712.test.ts and contracts/test/QuoteDigest.t.sol guards this.
 */
export const QUOTE_DOMAIN_NAME = 'QartaCheckout';
export const QUOTE_DOMAIN_VERSION = '1';

export const quoteTypes = {
  Quote: [
    { name: 'orderId', type: 'bytes32' },
    { name: 'payer', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'usdAmount', type: 'uint256' },
    { name: 'expiry', type: 'uint64' },
  ],
} as const;

/** A quote as signed by the backend. Amounts are token base units (bigint, never floats). */
export interface Quote {
  orderId: Hex;
  payer: Address;
  /** `0x000…000` for native QIE, otherwise the ERC-20 (QUSDC) address. */
  token: Address;
  amount: bigint;
  /** USD value with 6 decimals. */
  usdAmount: bigint;
  /** Unix seconds. */
  expiry: bigint;
}

export function quoteDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return { name: QUOTE_DOMAIN_NAME, version: QUOTE_DOMAIN_VERSION, chainId, verifyingContract };
}

/** Native QIE is encoded as the zero address in `Quote.token`. */
export const NATIVE_TOKEN: Address = '0x0000000000000000000000000000000000000000';
