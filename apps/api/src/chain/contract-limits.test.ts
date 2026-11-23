import { describe, expect, it } from 'vitest';
import { ContractLimitsError, lazyContractLimits, type ContractLimits } from './contract-limits';

const config = { ORACLE_MAX_AGE_S: 3600, FULFIL_CUTOFF_BEFORE_TIMEOUT_S: 900 };
const good: ContractLimits = { refundTimeoutSeconds: 7200, maxOracleAgeSeconds: 3600 };

describe('lazyContractLimits', () => {
  it('reads nothing until first use, then reads once', async () => {
    let reads = 0;
    const limits = lazyContractLimits(async () => {
      reads += 1;
      return good;
    }, config);
    expect(reads).toBe(0);
    expect(await limits()).toEqual(good);
    expect(await limits()).toEqual(good);
    expect(reads).toBe(1);
  });

  it('does not cache an RPC failure: the next call reads again', async () => {
    let reads = 0;
    const limits = lazyContractLimits(async () => {
      reads += 1;
      if (reads === 1) throw new Error('timeout');
      return good;
    }, config);
    await expect(limits()).rejects.toThrow('timeout');
    expect(await limits()).toEqual(good);
    expect(reads).toBe(2);
  });

  it('keeps refusing when config contradicts the contract', async () => {
    let reads = 0;
    const tooOld = lazyContractLimits(async () => {
      reads += 1;
      return { ...good, maxOracleAgeSeconds: 600 };
    }, config);
    await expect(tooOld()).rejects.toBeInstanceOf(ContractLimitsError);
    await expect(tooOld()).rejects.toThrow('exceeds the contract maxOracleAge');
    expect(reads).toBe(1);

    const lateCutoff = lazyContractLimits(
      async () => ({ ...good, refundTimeoutSeconds: 900 }),
      config,
    );
    await expect(lateCutoff()).rejects.toThrow('must be smaller than the contract refundTimeout');
  });
});
