import type { AppConfig } from '../config';

export interface ContractLimits {
  refundTimeoutSeconds: number;
  maxOracleAgeSeconds: number;
}

/** Contract settings the backend must agree with before it signs quotes or fulfils orders. */
export class ContractLimitsError extends Error {}

/**
 * Reads the contract settings once, on first use, instead of at start-up: a slow or dead RPC
 * must not stop the API from serving pages that do not touch the chain (config, catalog).
 * A failed read is not cached, so the next caller tries again. A config that contradicts
 * the contract is a permanent error and is cached, so quotes and fulfilment stay refused.
 */
export function lazyContractLimits(
  read: () => Promise<ContractLimits>,
  config: Pick<AppConfig, 'ORACLE_MAX_AGE_S' | 'FULFIL_CUTOFF_BEFORE_TIMEOUT_S'>,
): () => Promise<ContractLimits> {
  let pending: Promise<ContractLimits> | null = null;
  return () => {
    pending ??= read().then(
      (limits) => {
        if (config.ORACLE_MAX_AGE_S > limits.maxOracleAgeSeconds) {
          throw new ContractLimitsError(
            `ORACLE_MAX_AGE_S (${config.ORACLE_MAX_AGE_S}) exceeds the contract maxOracleAge (${limits.maxOracleAgeSeconds})`,
          );
        }
        if (config.FULFIL_CUTOFF_BEFORE_TIMEOUT_S >= limits.refundTimeoutSeconds) {
          throw new ContractLimitsError(
            'FULFIL_CUTOFF_BEFORE_TIMEOUT_S must be smaller than the contract refundTimeout',
          );
        }
        return limits;
      },
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  };
}
