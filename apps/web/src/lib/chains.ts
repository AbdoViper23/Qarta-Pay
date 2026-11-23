import { qieMainnet, qieTestnet } from '@qarta/shared';
import { defineChain, type Chain } from 'viem';
import { env } from './env';

const anvil = defineChain({
  id: 31337,
  name: 'Local anvil',
  nativeCurrency: { name: 'QIE', symbol: 'QIE', decimals: 18 },
  rpcUrls: { default: { http: [env.rpcUrl ?? 'http://127.0.0.1:8545'] } },
});

/** NEXT_PUBLIC_RPC_URL may hold one URL or a comma-separated list; it replaces the defaults. */
function withRpc(chain: Chain): Chain {
  const urls = (env.rpcUrl ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  if (urls.length === 0) return chain;
  return { ...chain, rpcUrls: { default: { http: urls } } };
}

/** The one chain this deployment of the storefront talks to. */
export const appChain: Chain =
  env.chainId === 1990 ? withRpc(qieMainnet) : env.chainId === 31337 ? anvil : withRpc(qieTestnet);

export const explorerUrl = appChain.blockExplorers?.default.url ?? '';

export function txLink(hash: string): string | null {
  return explorerUrl ? `${explorerUrl}/tx/${hash}` : null;
}

export function addressLink(address: string): string | null {
  return explorerUrl ? `${explorerUrl}/address/${address}` : null;
}
