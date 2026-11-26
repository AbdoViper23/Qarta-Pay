import type { OrderStatus } from './api';

/**
 * Order progress bar (order page). Each status owns a band of the bar. Inside its band the
 * bar creeps toward the band's ceiling and slows down as it gets close, so it keeps moving
 * without ever claiming more than is done. Only SETTLED (paid, delivered and settled on-chain)
 * shows 100 %. Each ceiling is at or below the next floor, so the bar never moves backwards.
 */
interface Band {
  floor: number;
  ceiling: number;
  /** Seconds to cover about 63 % of the band. */
  tauS: number;
}

const BANDS: Partial<Record<OrderStatus, Band>> = {
  QUOTED: { floor: 4, ceiling: 28, tauS: 10 }, // payment confirming on QIE
  PAID: { floor: 30, ceiling: 45, tauS: 6 }, // payment seen, delivery starting
  FULFILLING: { floor: 45, ceiling: 90, tauS: 30 }, // supplier delivering
  DELIVERED: { floor: 90, ceiling: 99, tauS: 12 }, // delivered, settling on-chain
};

export const PROGRESS_BANDS = BANDS;

/** Percent (0–100) for `status`, `secondsInStatus` after the page first saw it. */
export function progressPercent(status: OrderStatus, secondsInStatus: number): number {
  if (status === 'SETTLED') return 100;
  const band = BANDS[status];
  if (!band) return 0;
  const t = Math.max(0, secondsInStatus);
  const value = band.floor + (band.ceiling - band.floor) * (1 - Math.exp(-t / band.tauS));
  // Stay a hair under the ceiling so the bar visibly waits for the next status.
  return Math.min(value, band.ceiling - 0.1);
}

/** Statuses the bar animates through; anything else is a final or exceptional state. */
export function isInFlow(status: OrderStatus): boolean {
  return status === 'SETTLED' || BANDS[status] !== undefined;
}
