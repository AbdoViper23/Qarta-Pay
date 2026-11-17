import { defineChain, type Chain } from 'viem';
import { qieMainnetConfig, qieTestnetConfig, type ChainConfig } from './deployments';

function toViemChain(config: ChainConfig, testnet: boolean): Chain {
  return defineChain({
    id: config.chainId,
    name: config.name,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: { default: { http: config.rpcUrls } },
    blockExplorers: { default: { name: 'QIE Explorer', url: config.explorerUrl } },
    testnet,
  });
}

export const qieMainnet = toViemChain(qieMainnetConfig, false);
export const qieTestnet = toViemChain(qieTestnetConfig, true);

/** Token decimals. QUSDC and USD amounts use 6; native QIE and WQIE use 18. */
export const QUSDC_DECIMALS = 6;
export const USD_DECIMALS = 6;
export const QIE_DECIMALS = 18;
/** Decimals of the QIE/USD price feed, read on-chain on 17 Nov 2026. */
export const QIE_USD_FEED_DECIMALS = 8;
