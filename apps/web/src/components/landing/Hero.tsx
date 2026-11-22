'use client';

import { motion, useScroll, useTransform } from 'motion/react';
import Link from 'next/link';
import { useRef } from 'react';
import { PhoneDemo } from './PhoneDemo';

const ease = [0.22, 1, 0.36, 1] as const;
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay, ease },
});

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const phoneY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const cardY = useTransform(scrollYProgress, [0, 1], [0, -120]);

  return (
    <section ref={ref} className="relative isolate overflow-hidden pt-32 pb-24 sm:pt-40">
      {/* One soft warm light from above; the grain does the rest. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(60%_60%_at_70%_0%,rgb(201_164_106/0.08),transparent_70%)]" />

      <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <motion.p {...rise(0)} className="flex items-center gap-2 text-sm text-muted">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden />
            Live on QIE Mainnet
          </motion.p>

          <motion.h1
            {...rise(0.08)}
            className="mt-6 max-w-[12ch] font-display text-[3.25rem] leading-[0.98] font-light tracking-[-0.02em] text-balance sm:text-7xl lg:text-[5.4rem]"
          >
            Spend your crypto on real life.
          </motion.h1>

          <motion.p {...rise(0.18)} className="mt-7 max-w-md text-lg leading-relaxed text-muted">
            Mobile airtime and gift cards, paid with QIE or QUSDC. Your payment waits in an on-chain
            escrow and moves only when delivery is confirmed.
          </motion.p>

          <motion.div {...rise(0.28)} className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/airtime"
              className="inline-flex min-h-12 items-center rounded-full bg-ink px-7 font-medium text-bg transition-colors hover:bg-white"
            >
              Top up a phone
            </Link>
            <Link
              href="/giftcards"
              className="inline-flex min-h-12 items-center rounded-full border border-line px-7 font-medium transition-colors hover:border-ink/40"
            >
              Buy a gift card
            </Link>
          </motion.div>

          <motion.dl
            {...rise(0.4)}
            className="mt-14 grid max-w-lg grid-cols-3 border-t border-line pt-6 text-sm"
          >
            {[
              ['Escrow', 'Held on-chain until delivery'],
              ['Refunds', 'Automatic if delivery fails'],
              ['Pay in', 'QIE or QUSDC'],
            ].map(([term, detail]) => (
              <div key={term} className="pr-4">
                <dt className="text-ink">{term}</dt>
                <dd className="mt-1 text-muted">{detail}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, delay: 0.25, ease }}
            style={{ y: phoneY }}
          >
            <PhoneDemo />
          </motion.div>

          {/* A brushed-metal card behind the phone, moving at its own pace. Decorative. */}
          <motion.div
            aria-hidden
            style={{ y: cardY }}
            initial={{ opacity: 0, rotate: -14, x: -20 }}
            animate={{ opacity: 1, rotate: -9, x: 0 }}
            transition={{ duration: 1.2, delay: 0.7, ease }}
            className="absolute top-28 -left-4 -z-10 hidden aspect-[1.586] w-56 rounded-2xl border border-white/10 bg-[linear-gradient(135deg,#3a3229_0%,#5b4b35_45%,#2b251f_100%)] p-5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.8)] sm:block lg:-left-16"
          >
            <span className="block h-6 w-8 rounded-md bg-[linear-gradient(135deg,#e7cf9f,#a8844e)]" />
            <p className="mt-8 font-display text-lg text-ink/90">Qarta</p>
            <p className="font-mono text-[10px] tracking-wider text-ink/50">•••• 4F2A</p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
