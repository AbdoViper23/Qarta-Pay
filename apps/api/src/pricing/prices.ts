import type { PublicClient } from 'viem';
import type { AppConfig } from '../config';
import { readOracle, type OraclePrice } from './oracle';
import { crossCheck, readPool, type CrossCheckResult, type PoolPrice } from './qiedex-check';

export interface PriceSnapshot {
  oracle: OraclePrice | null;
  pool: PoolPrice | null;
  check: CrossCheckResult | null;
  /** QIE quotes allowed right now, and the USD price (6 decimals) they use. */
  qie: { enabled: true; priceUsd6: bigint } | { enabled: false; reason: string };
  readAt: Date;
}

/** Reads oracle and pool together, at most once every `ttlMs` (15 s by default). */
export class PriceService {
  private snapshot: PriceSnapshot | null = null;
  private inflight: Promise<PriceSnapshot> | null = null;

  constructor(
    private readonly client: PublicClient,
    private readonly config: AppConfig,
    private readonly onRefusal: (reason: string, snapshot: PriceSnapshot) => void = () => {},
    private readonly ttlMs = 15_000,
  ) {}

  async get(): Promise<PriceSnapshot> {
    if (this.snapshot && Date.now() - this.snapshot.readAt.getTime() < this.ttlMs)
      return this.snapshot;
    this.inflight ??= this.read().finally(() => {
      this.inflight = null;
    });
    this.snapshot = await this.inflight;
    return this.snapshot;
  }

  private async read(): Promise<PriceSnapshot> {
    const { qieUsdFeed, pair, wqie, qusdc } = this.config.addresses;
    const readAt = new Date();
    const oracle = qieUsdFeed ? await readOracle(this.client, qieUsdFeed).catch(() => null) : null;
    const pool =
      pair && wqie ? await readPool(this.client, pair, wqie, qusdc).catch(() => null) : null;

    const refuse = (reason: string): PriceSnapshot => {
      const snapshot: PriceSnapshot = {
        oracle,
        pool,
        check: null,
        qie: { enabled: false, reason },
        readAt,
      };
      this.onRefusal(reason, snapshot);
      return snapshot;
    };
    if (!oracle) return refuse('oracle_unavailable');
    if (oracle.ageSeconds > this.config.ORACLE_MAX_AGE_S || oracle.ageSeconds < -60)
      return refuse('oracle_stale');

    const check = crossCheck({
      oraclePriceUsd6: oracle.priceUsd6,
      pool,
      maxDeviationBps: this.config.DEX_ORACLE_MAX_DEVIATION_BPS,
      minReserveQusdc: this.config.DEX_MIN_RESERVE_QUSDC,
      enabled: this.config.DEX_PRICE_CHECK_ENABLED,
    });
    if (!check.ok) return { ...refuse(check.reason), check };
    return { oracle, pool, check, qie: { enabled: true, priceUsd6: check.priceUsd6 }, readAt };
  }
}
