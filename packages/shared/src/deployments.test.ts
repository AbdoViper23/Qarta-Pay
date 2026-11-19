import { describe, expect, it } from 'vitest';
import signatures from '../abi/unverified-signatures.json';
import {
  QIE_MAINNET_CHAIN_ID,
  QIE_TESTNET_CHAIN_ID,
  getChainConfig,
  qieMainnetConfig,
  qieTestnetConfig,
  requireAddress,
} from './deployments';
import { qieMainnet, qieTestnet } from './chains';

describe('chain config', () => {
  it('has the documented chain ids', () => {
    expect(qieMainnetConfig.chainId).toBe(1990);
    expect(qieTestnetConfig.chainId).toBe(1983);
    expect(qieMainnet.id).toBe(QIE_MAINNET_CHAIN_ID);
    expect(qieTestnet.id).toBe(QIE_TESTNET_CHAIN_ID);
  });

  it('lists every public mainnet RPC host and no duplicates', () => {
    expect(qieMainnetConfig.rpcUrls).toHaveLength(5);
    expect(new Set(qieMainnetConfig.rpcUrls).size).toBe(5);
  });

  it('rejects an unknown chain id', () => {
    expect(() => getChainConfig(1)).toThrow('Unsupported chain id 1');
  });
});

describe('addresses', () => {
  it('has a distinct mainnet address for every QIE ecosystem contract', () => {
    const { qartaCheckout, ...ecosystem } = qieMainnetConfig.addresses;
    expect(qartaCheckout).toBeNull(); // not deployed yet
    const values = Object.values(ecosystem);
    expect(values.every((address) => address !== null)).toBe(true);
    expect(new Set(values).size).toBe(values.length);
  });

  it('has no QIEDex or QIE ID addresses on testnet (they do not exist there)', () => {
    // Our own deployment and mocks fill qartaCheckout, qusdc, qieUsdFeed, the mock pair and its
    // WQIE token address; the real QIEDex router/factory and QIE ID contracts stay absent.
    const {
      qartaCheckout: _c,
      qusdc: _q,
      qieUsdFeed: _f,
      qiedexWqieQusdcPair: _p,
      wqie: _w,
      ...absent
    } = qieTestnetConfig.addresses;
    expect(Object.values(absent).every((address) => address === null)).toBe(true);
  });

  it('requireAddress returns a configured address and throws for a missing one', () => {
    expect(requireAddress(1990, 'qusdc')).toBe('0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5');
    expect(() => requireAddress(1990, 'qartaCheckout')).toThrow(
      'No qartaCheckout address configured for chain 1990',
    );
    expect(requireAddress(1983, 'qusdc')).toBe('0x52259E57Ba961292a23AB4F78D3C815d84030B42');
    expect(() => requireAddress(1983, 'qiedexRouter')).toThrow();
  });

  it('matches the addresses recorded with the probed signatures', () => {
    const a = qieMainnetConfig.addresses;
    expect(signatures.QIEDexRouter.address).toBe(a.qiedexRouter);
    expect(signatures.QIEDexFactory.address).toBe(a.qiedexFactory);
    expect(signatures.QIEDexPairWqieQusdc.address).toBe(a.qiedexWqieQusdcPair);
    expect(signatures.QieReverseResolver.address).toBe(a.qieReverseResolver);
    expect(signatures.QieNameRegistry.addresses).toEqual([a.qieNameRegistryA, a.qieNameRegistryB]);
    expect(signatures.QieNameNft.address).toBe(a.qieNameNft);
  });
});
