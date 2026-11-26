import { describe, expect, it } from 'vitest';
import type { OrderStatus } from './api';
import { FAST_SHARE, PROGRESS_BANDS, isInFlow, progressPercent } from './progress';

const FLOW: OrderStatus[] = ['QUOTED', 'PAID', 'FULFILLING', 'DELIVERED'];

describe('progressPercent', () => {
  it('shows 100 only when the order is settled', () => {
    expect(progressPercent('SETTLED', 0)).toBe(100);
    for (const status of FLOW) {
      expect(progressPercent(status, 0)).toBeLessThan(100);
      expect(progressPercent(status, 1e9)).toBeLessThan(100);
    }
  });

  it('keeps moving inside a status but never reaches its ceiling', () => {
    for (const status of FLOW) {
      const band = PROGRESS_BANDS[status]!;
      let previous = progressPercent(status, 0);
      expect(previous).toBeCloseTo(band.floor);
      for (const t of [1, 5, 20, 60, 300, 1e9]) {
        const value = progressPercent(status, t);
        expect(value).toBeGreaterThanOrEqual(previous);
        expect(value).toBeLessThan(band.ceiling);
        previous = value;
      }
      expect(progressPercent(status, 5)).toBeGreaterThan(band.floor);
    }
  });

  it('never goes backwards when the status advances', () => {
    for (let i = 0; i < FLOW.length - 1; i += 1) {
      const lateInThis = progressPercent(FLOW[i]!, 1e9);
      const startOfNext = progressPercent(FLOW[i + 1]!, 0);
      expect(startOfNext).toBeGreaterThanOrEqual(lateInThis);
    }
    expect(progressPercent('SETTLED', 0)).toBeGreaterThan(progressPercent('DELIVERED', 1e9));
  });

  it('runs fast through 90 % of each band, then crawls through the last 10 %', () => {
    for (const status of FLOW) {
      const band = PROGRESS_BANDS[status]!;
      const range = band.ceiling - band.floor;
      const fastEnd = band.floor + range * FAST_SHARE;
      // Halfway through the fast phase it is already past half of that phase (ease-out).
      expect(progressPercent(status, band.fastS / 2)).toBeGreaterThan(
        band.floor + (fastEnd - band.floor) / 2,
      );
      // The fast phase ends exactly at 90 % of the band, with no jump.
      expect(progressPercent(status, band.fastS - 1e-6)).toBeCloseTo(fastEnd, 3);
      expect(progressPercent(status, band.fastS)).toBeCloseTo(fastEnd, 6);
      // A slow-phase step of 1 s moves less than the fast phase's average speed by far.
      const fastSpeed = (fastEnd - band.floor) / band.fastS;
      const slowStep =
        progressPercent(status, band.fastS + 1) - progressPercent(status, band.fastS);
      expect(slowStep).toBeGreaterThan(0);
      expect(slowStep).toBeLessThan(fastSpeed / 5);
      // One slow time constant later it has covered only about 63 % of the last 10 %.
      expect(progressPercent(status, band.fastS + band.slowTauS)).toBeLessThan(
        fastEnd + (band.ceiling - fastEnd) * 0.7,
      );
    }
  });

  it('treats a negative clock skew as zero', () => {
    expect(progressPercent('PAID', -10)).toBe(progressPercent('PAID', 0));
  });
});

describe('isInFlow', () => {
  it('covers the happy path only', () => {
    for (const status of [...FLOW, 'SETTLED'] as OrderStatus[]) expect(isInFlow(status)).toBe(true);
    for (const status of ['REFUNDED', 'REFUND_PENDING', 'EXPIRED', 'NEEDS_REVIEW'] as OrderStatus[])
      expect(isInFlow(status)).toBe(false);
  });
});
