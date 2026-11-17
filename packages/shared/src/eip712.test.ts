import { describe, expect, it } from 'vitest';
import { hashTypedData, recoverTypedDataAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { quoteDomain, quoteTypes, type Quote } from './eip712';

// Same vector as contracts/test/QuoteDigest.t.sol. If either side changes, both tests fail.
const VERIFYING_CONTRACT = '0x00000000000000000000000000000000000ca47a';
const EXPECTED_DIGEST = '0x2d07dea94dd99a1ef9a08c4e4150596f24b182f99648110b078b164556cd1cf1';

const quote: Quote = {
  orderId: '0x1111111111111111111111111111111111111111111111111111111111111111',
  payer: '0x2222222222222222222222222222222222222222',
  token: '0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5',
  amount: 10_000_000n,
  usdAmount: 10_000_000n,
  expiry: 1_800_000_000n,
};

describe('Quote EIP-712', () => {
  it('produces the same digest as QartaCheckout.hashQuote', () => {
    const digest = hashTypedData({
      domain: quoteDomain(1990, VERIFYING_CONTRACT),
      types: quoteTypes,
      primaryType: 'Quote',
      message: quote,
    });
    expect(digest).toBe(EXPECTED_DIGEST);
  });

  it('binds the digest to chain and contract', () => {
    const other = (chainId: number, contract: `0x${string}`) =>
      hashTypedData({
        domain: quoteDomain(chainId, contract),
        types: quoteTypes,
        primaryType: 'Quote',
        message: quote,
      });
    expect(other(1983, VERIFYING_CONTRACT)).not.toBe(EXPECTED_DIGEST);
    expect(other(1990, '0x00000000000000000000000000000000000ca47b')).not.toBe(EXPECTED_DIGEST);
  });

  it('a viem signature recovers to the signer', async () => {
    const account = privateKeyToAccount(generatePrivateKey()); // fresh throwaway key per run
    const args = {
      domain: quoteDomain(1990, VERIFYING_CONTRACT),
      types: quoteTypes,
      primaryType: 'Quote',
      message: quote,
    } as const;
    const signature = await account.signTypedData(args);
    expect(await recoverTypedDataAddress({ ...args, signature })).toBe(account.address);
  });
});
