import {
  createPublicClient,
  createWalletClient,
  defineChain,
  fallback,
  http,
  type Account,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { AppConfig } from '../config';

export type Clients = {
  chain: Chain;
  publicClient: PublicClient<Transport, Chain>;
  fulfiller: WalletClient<Transport, Chain, Account>;
  quoteSigner: Account;
};

/**
 * One public client spread over every configured RPC URL (QIE's public RPCs are slow and
 * sometimes drop connections), plus the fulfiller wallet and the quote-signer account.
 */
export function createClients(config: AppConfig): Clients {
  const chain = defineChain({
    id: config.CHAIN_ID,
    name: `QIE ${config.CHAIN_ID}`,
    nativeCurrency: { name: 'QIE', symbol: 'QIE', decimals: 18 },
    rpcUrls: { default: { http: config.RPC_URLS } },
  });
  const transport = fallback(
    config.RPC_URLS.map((url) => http(url, { timeout: 20_000, retryCount: 2 })),
    { rank: false },
  );
  const publicClient = createPublicClient({ chain, transport });
  const fulfiller = createWalletClient({
    chain,
    transport,
    account: privateKeyToAccount(config.FULFILLER_KEY),
  });
  return {
    chain,
    publicClient,
    fulfiller,
    quoteSigner: privateKeyToAccount(config.QUOTE_SIGNER_KEY),
  };
}
