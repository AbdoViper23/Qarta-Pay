'use client';

import { motion } from 'motion/react';
import { useIntroDone } from '@/components/IntroSplash';

/**
 * The hero object: a receipt that feeds out of an unseen printer line by line, then gets
 * stamped PAID. Illustration of one order; no real data. It starts once the logo intro has
 * landed, so the print is not spent behind the intro overlay.
 */
const ROWS: [string, string][] = [
  ['MTN Nigeria airtime', '₦1,500'],
  ['To', '+234 803 ••• 4567'],
  ['Rate', '1 USD = ₦1,442'],
];
const ease = [0.22, 1, 0.36, 1] as const;

export function Receipt() {
  const ready = useIntroDone();
  const go = ready ? 'show' : 'hide';
  return (
    <div className="relative mx-auto w-full max-w-[22rem]">
      {/* Printer slot the paper comes out of. */}
      <div
        className="relative z-10 mx-auto h-3 w-[106%] -translate-x-[2.8%] rounded-sm bg-ink"
        aria-hidden
      />
      <motion.div
        initial="hide"
        animate={go}
        variants={{
          hide: { clipPath: 'inset(0 0 100% 0)', y: -24 },
          show: {
            clipPath: 'inset(0 0 0% 0)',
            y: 0,
            transition: { duration: 1.4, delay: 0.3, ease },
          },
        }}
        className="receipt-edge relative -mt-1 rotate-[1.5deg] bg-surface px-6 pt-8 pb-9 text-[13px] shadow-[0_30px_50px_-30px_rgb(0_0_0/0.35)]"
      >
        <p className="text-center font-display text-3xl font-extrabold tracking-wide uppercase">
          Qarta Pay
        </p>
        <p className="mt-1 text-center text-[11px] text-muted">Order 0x7a2c…91e4</p>
        <p className="text-center text-[11px] text-muted">23 Nov 2026, 14:02</p>
        <div className="dashed-t my-4" />
        {ROWS.map(([label, value], i) => (
          <motion.div
            key={label}
            initial="hide"
            animate={go}
            variants={{
              hide: { opacity: 0 },
              show: { opacity: 1, transition: { delay: 0.7 + i * 0.15 } },
            }}
            className="flex justify-between gap-3 py-1"
          >
            <span>{label}</span>
            <span>{value}</span>
          </motion.div>
        ))}
        <div className="dashed-t my-4" />
        <motion.div
          initial="hide"
          animate={go}
          variants={{ hide: { opacity: 0 }, show: { opacity: 1, transition: { delay: 1.2 } } }}
          className="space-y-1"
        >
          <div className="flex justify-between text-base font-semibold">
            <span>TOTAL</span>
            <span>1.04 QUSDC</span>
          </div>
          <div className="flex justify-between">
            <span>Held by</span>
            <span>QartaCheckout</span>
          </div>
          <div className="flex justify-between">
            <span>Status</span>
            <span>Delivered</span>
          </div>
        </motion.div>
        <div className="barcode mt-5 h-10" aria-hidden />
        <p className="mt-2 text-center text-[10px] tracking-[0.3em] text-muted">QP7A2C91E4</p>

        <motion.span
          aria-hidden
          initial="hide"
          animate={go}
          variants={{
            hide: { opacity: 0, scale: 2.4, rotate: -24 },
            show: {
              opacity: 0.9,
              scale: 1,
              rotate: -14,
              transition: { delay: 1.9, type: 'spring', stiffness: 420, damping: 18 },
            },
          }}
          className="absolute top-[44%] right-5 border-[3px] border-brand px-3 py-0.5 font-display text-3xl font-extrabold tracking-widest text-brand mix-blend-multiply dark-stamp"
        >
          PAID
        </motion.span>
      </motion.div>
    </div>
  );
}
