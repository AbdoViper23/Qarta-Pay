import { createConfig, fallback, http, injected } from 'wagmi';
import { appChain } from './chains';

declare global {
  interface Window {
    qie?: unknown;
  }
}

/**
 * Wallet connection (docs/06-FRONTEND.md). EIP-6963 discovery finds QIE Wallet
 * (rdns `me.qiewallet`) next to other extensions. The explicit `qieWallet` connector covers
 * QIE Wallet setups without EIP-6963 through `window.qie`, which only QIE Wallet sets.
 * The UI lists QIE Wallet first.
 */
export const wagmiConfig = createConfig({
  chains: [appChain],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected({
      target: {
        id: 'qieWallet',
        name: 'QIE Wallet',
        provider: (window) => (window as Window | undefined)?.qie as never,
      },
    }),
    injected(),
  ],
  // Reads go to every public RPC of the chain in turn: QIE RPCs go down one at a time.
  transports: {
    [appChain.id]: fallback(
      appChain.rpcUrls.default.http.map((url) => http(url, { timeout: 10_000 })),
    ),
  },
  ssr: true,
});

export const QIE_WALLET_RDNS = 'me.qiewallet';
