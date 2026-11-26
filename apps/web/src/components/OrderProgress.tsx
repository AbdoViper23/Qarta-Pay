'use client';

import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { OrderStatus } from '@/lib/api';
import { progressPercent } from '@/lib/progress';

/** A step is ticked once it is finished; the first unticked step shows a pulsing dot. */
const STEPS = [
  { label: 'Paid', reached: ['PAID', 'FULFILLING', 'DELIVERED', 'SETTLED'] },
  { label: 'Delivering', reached: ['DELIVERED', 'SETTLED'] },
  { label: 'Delivered', reached: ['DELIVERED', 'SETTLED'] },
] as const;

const CAPTION: Partial<Record<OrderStatus, string>> = {
  QUOTED: 'Confirming your payment on QIE…',
  PAID: 'Payment received. Starting delivery…',
  FULFILLING: 'Delivering… usually seconds, some operators take a few minutes',
  DELIVERED: 'Delivered. Releasing the escrow on QIE…',
  SETTLED: 'Complete',
  NEEDS_REVIEW: 'Paused for a manual check',
};

/**
 * Progress bar for one order. It creeps forward inside the current status (lib/progress.ts),
 * jumps ahead when the status advances, and reaches 100 % only when the order is settled.
 * NEEDS_REVIEW freezes it where it stood.
 */
export function OrderProgress({ status }: { status: OrderStatus }) {
  const enteredAt = useRef<{ status: OrderStatus; at: number }>({ status, at: Date.now() });
  const shown = useRef(0);
  const [, tick] = useState(0);

  if (enteredAt.current.status !== status) enteredAt.current = { status, at: Date.now() };

  const frozen = status === 'NEEDS_REVIEW';
  const done = status === 'SETTLED';
  useEffect(() => {
    if (done || frozen) return;
    const timer = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(timer);
  }, [done, frozen]);

  if (!frozen) {
    const seconds = (Date.now() - enteredAt.current.at) / 1000;
    // Never move backwards, even if a refetch briefly returns an older status.
    shown.current = Math.max(shown.current, progressPercent(status, seconds));
  } else if (shown.current === 0) {
    shown.current = 50;
  }
  const percent = shown.current;
  const currentStep = STEPS.findIndex((s) => !(s.reached as readonly string[]).includes(status));

  const fill = done ? 'bg-ok' : frozen ? 'bg-danger' : 'bg-ink';
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold" aria-live="polite">
          {CAPTION[status]}
        </span>
        <span className="font-mono tabular-nums text-muted">{Math.floor(percent)}%</span>
      </div>

      <div
        role="progressbar"
        aria-label="Order progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.floor(percent)}
        className="relative h-4 overflow-hidden border-2 border-ink bg-surface-2"
      >
        <div
          className={`relative h-full ${fill} transition-[width] duration-500 ease-out`}
          style={{ width: `${percent}%` }}
        >
          {!done && !frozen && (
            <div
              aria-hidden
              className="absolute inset-0 animate-shimmer"
              style={{
                backgroundImage:
                  'linear-gradient(110deg, transparent 30%, color-mix(in srgb, var(--color-surface) 40%, transparent) 50%, transparent 70%)',
                backgroundSize: '200% 100%',
              }}
            />
          )}
        </div>
      </div>

      <ol className="flex justify-between gap-2 text-xs sm:text-sm">
        {STEPS.map((step, i) => {
          const reached = (step.reached as readonly string[]).includes(status);
          const current = i === currentStep && !frozen;
          return (
            <li
              key={step.label}
              className={`flex shrink-0 items-center gap-1.5 font-semibold ${reached || current ? 'text-ink' : 'text-muted'}`}
            >
              <span
                aria-hidden
                className={`flex size-5 shrink-0 items-center justify-center border-2 ${reached ? (done ? 'border-ok bg-ok text-surface' : 'border-ink bg-ink text-surface') : 'border-ink/30'}`}
              >
                {reached ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : current ? (
                  <span className="size-2 animate-pulse rounded-full bg-ink" />
                ) : null}
              </span>
              {step.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
