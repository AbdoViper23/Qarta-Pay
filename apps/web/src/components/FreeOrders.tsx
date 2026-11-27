'use client';

import { Check, Gift } from 'lucide-react';

/**
 * The free-order offer at checkout: one slot per free order, filled while it is still unused.
 * Rendered only while the wallet has free orders left; the caller hides it at zero.
 */
export function FreeOrdersCard({
  left,
  total,
  maxUsd,
  thisOrderFree,
}: {
  left: number;
  total: number;
  maxUsd: number;
  /** Set when the current price is one of the free orders. */
  thisOrderFree: boolean;
}) {
  const used = total - left;
  return (
    <section
      aria-label="Free orders"
      className="relative overflow-hidden border-2 border-brand bg-brand-soft p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center bg-brand text-brand-ink">
          <Gift className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display text-xl leading-tight font-extrabold uppercase">
            Your first {total} orders are on us
          </p>
          <p className="mt-1 text-sm text-ink/80">
            No Qarta fee on products up to ${maxUsd}. You pay only the product cost.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t-2 border-dashed border-brand/50 pt-3">
        <ol className="flex gap-1.5" aria-hidden>
          {Array.from({ length: total }, (_, i) => {
            const isUsed = i < used;
            const isThis = thisOrderFree && i === used;
            return (
              <li
                key={i}
                className={`flex size-8 items-center justify-center border-2 text-xs font-bold ${
                  isUsed
                    ? 'border-brand/40 text-brand/50'
                    : isThis
                      ? 'animate-pulse border-brand bg-surface text-brand'
                      : 'border-brand bg-brand text-brand-ink'
                }`}
              >
                {isUsed ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </li>
            );
          })}
        </ol>
        <p className="text-right text-sm font-semibold">
          <span className="font-display text-2xl leading-none font-extrabold text-brand">
            {left}
          </span>{' '}
          of {total} free orders left
        </p>
      </div>

      {thisOrderFree && (
        <p className="mt-3 bg-brand px-3 py-2 text-sm font-semibold text-brand-ink">
          This order is free: order {used + 1} of {total}.
        </p>
      )}
    </section>
  );
}
