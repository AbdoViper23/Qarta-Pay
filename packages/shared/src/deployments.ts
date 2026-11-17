import { getAddress, isAddress, type Address } from 'viem';
import { z } from 'zod';
import mainnetJson from '../config/qie-mainnet.json';
import testnetJson from '../config/qie-testnet.json';

/**
 * Chain configuration and contract addresses.
 *
 * The values live in `config/*.json`, not in code. Mainnet addresses were confirmed
 * on-chain on 17 Nov 2026 (docs/probe-results.md). Testnet has none of the QIE
 * ecosystem contracts, so its addresses stay null until our mocks are deployed.
 */

const addressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: true }), 'not a checksummed address')
  .transform((value): Address => getAddress(value));

const optionalAddress = addressSchema.nullable();

const chainConfigSchema = z.object({
  chainId: z.number().int().positive(),
  name: z.string().min(1),
  nativeCurrency: z.object({
    name: z.string(),
    symbol: z.string(),
    decimals: z.literal(18),
  }),
  rpcUrls: z.array(z.url()).min(1),
  explorerUrl: z.url(),
  getLogsMaxBlockRange: z.number().int().positive(),
  addresses: z.object({
    qartaCheckout: optionalAddress,
    qusdc: optionalAddress,
    wqie: optionalAddress,
    qieUsdFeed: optionalAddress,
    qiedexRouter: optionalAddress,
    qiedexFactory: optionalAddress,
    qiedexWqieQusdcPair: optionalAddress,
    qieReverseResolver: optionalAddress,
    qieNameRegistryA: optionalAddress,
    qieNameRegistryB: optionalAddress,
    qieNameNft: optionalAddress,
  }),
});

export type ChainConfig = z.infer<typeof chainConfigSchema>;
export type ContractName = keyof ChainConfig['addresses'];

export const QIE_MAINNET_CHAIN_ID = 1990;
export const QIE_TESTNET_CHAIN_ID = 1983;

export const qieMainnetConfig: ChainConfig = chainConfigSchema.parse(mainnetJson);
export const qieTestnetConfig: ChainConfig = chainConfigSchema.parse(testnetJson);

const configs: ReadonlyMap<number, ChainConfig> = new Map([
  [qieMainnetConfig.chainId, qieMainnetConfig],
  [qieTestnetConfig.chainId, qieTestnetConfig],
]);

export function getChainConfig(chainId: number): ChainConfig {
  const config = configs.get(chainId);
  if (!config) throw new Error(`Unsupported chain id ${chainId}`);
  return config;
}

/** Returns the address or throws. Use it where a missing contract must stop the caller. */
export function requireAddress(chainId: number, name: ContractName): Address {
  const address = getChainConfig(chainId).addresses[name];
  if (!address) throw new Error(`No ${name} address configured for chain ${chainId}`);
  return address;
}
