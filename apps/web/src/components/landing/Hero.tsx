'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { Receipt } from './Receipt';

const ease = [0.22, 1, 0.36, 1] as const;
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease },
});

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 sm:pt-36">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <motion.p {...rise(0)} className="text-xs font-semibold uppercase">
            <span className="mr-2 inline-block size-2 bg-brand align-middle" aria-hidden />
            Live on QIE Mainnet
          </motion.p>

          <motion.h1
            {...rise(0.06)}
            className="mt-5 font-display text-[3.6rem] leading-[0.86] font-extrabold uppercase sm:text-8xl lg:text-[7.2rem]"
          >
            Spend crypto on real life.
          </motion.h1>

          <motion.p
            {...rise(0.16)}
            className="mt-7 max-w-lg text-sm leading-7 text-muted sm:text-[15px]"
          >
            Airtime and gift cards, paid in QIE or QUSDC. The payment is held by a contract on QIE
            Mainnet and released only after delivery. If delivery fails, it comes back.
          </motion.p>

          <motion.div {...rise(0.26)} className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/airtime"
              className="inline-flex min-h-12 items-center border-2 border-ink bg-ink px-6 text-sm font-semibold text-surface transition-colors hover:bg-[#2a2a2a]"
            >
              Top up a phone
            </Link>
            <Link
              href="/giftcards"
              className="inline-flex min-h-12 items-center border-2 border-ink px-6 text-sm font-semibold transition-colors hover:bg-surface"
            >
              Buy a gift card
            </Link>
          </motion.div>

          <motion.dl
            {...rise(0.36)}
            className="dashed-t mt-12 grid max-w-lg grid-cols-3 gap-4 pt-5 text-xs"
          >
            {[
              ['Escrow', 'Held until delivery'],
              ['Refunds', 'Automatic on failure'],
              ['Pay in', 'QIE or QUSDC'],
            ].map(([term, detail]) => (
              <div key={term}>
                <dt className="font-semibold uppercase">{term}</dt>
                <dd className="mt-1 text-muted">{detail}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <Receipt />
      </div>
    </section>
  );
}
