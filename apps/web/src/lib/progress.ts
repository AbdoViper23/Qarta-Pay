import type { OrderStatus } from './api';

/**
 * Order progress bar (order page). Each status owns a band of the bar. Inside its band the
 * bar runs fast through the first 90 % (easing out over `fastS` seconds), then crawls through
 * the last 10 % and slows down as it gets close, so it keeps moving without ever claiming
 * more than is done. Only SETTLED (paid, delivered and settled on-chain) shows 100 %.
 * Each ceiling is at or below the next floor, so the bar never moves backwards.
 */
interface Band {
  floor: number;
  ceiling: number;
  /** Seconds to cover the first 90 % of the band. */
  fastS: number;
  /** Seconds to cover about 63 % of the last 10 %. */
  slowTauS: number;
}

/** Share of a band covered in the fast phase. */
export const FAST_SHARE = 0.9;

const BANDS: Partial<Record<OrderStatus, Band>> = {
  QUOTED: { floor: 4, ceiling: 28, fastS: 4, slowTauS: 30 }, // payment confirming on QIE
  PAID: { floor: 30, ceiling: 45, fastS: 2, slowTauS: 20 }, // payment seen, delivery starting
  FULFILLING: { floor: 45, ceiling: 90, fastS: 5, slowTauS: 60 }, // supplier delivering
  DELIVERED: { floor: 90, ceiling: 99, fastS: 3, slowTauS: 30 }, // delivered, settling on-chain
};

export const PROGRESS_BANDS = BANDS;

/** Percent (0–100) for `status`, `secondsInStatus` after the page first saw it. */
export function progressPercent(status: OrderStatus, secondsInStatus: number): number {
  if (status === 'SETTLED') return 100;
  const band = BANDS[status];
  if (!band) return 0;
  const t = Math.max(0, secondsInStatus);
  const range = band.ceiling - band.floor;
  const fastEnd = band.floor + range * FAST_SHARE;

  if (t < band.fastS) {
    const x = t / band.fastS;
    return band.floor + (fastEnd - band.floor) * (1 - (1 - x) ** 3); // ease-out cubic
  }
  const slow = (band.ceiling - fastEnd) * (1 - Math.exp(-(t - band.fastS) / band.slowTauS));
  // Stay a hair under the ceiling so the bar visibly waits for the next status.
  return Math.min(fastEnd + slow, band.ceiling - 0.1);
}

/** Statuses the bar animates through; anything else is a final or exceptional state. */
export function isInFlow(status: OrderStatus): boolean {
  return status === 'SETTLED' || BANDS[status] !== undefined;
}
