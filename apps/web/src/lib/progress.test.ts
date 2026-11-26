import { describe, expect, it } from 'vitest';
import type { OrderStatus } from './api';
import { PROGRESS_BANDS, isInFlow, progressPercent } from './progress';

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
