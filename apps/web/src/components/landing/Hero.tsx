'use client';

import { ArrowRight, Gift, RotateCcw, ShieldCheck } from 'lucide-react';
import { motion, useScroll, useTransform } from 'motion/react';
import Link from 'next/link';
import { useRef } from 'react';
import { PhoneDemo } from './PhoneDemo';

const ease = [0.22, 1, 0.36, 1] as const;
const line1 = ['Spend', 'your', 'crypto'];
const line2 = ['on', 'real', 'life.'];

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const phoneY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const cardY = useTransform(scrollYProgress, [0, 1], [0, -160]);
  const coinY = useTransform(scrollYProgress, [0, 1], [0, -260]);
  const glowOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section ref={ref} className="relative isolate overflow-hidden pt-32 pb-24 sm:pt-40">
      {/* Background: drifting aurora, fine grid, and a soft horizon line. */}
      <motion.div
        style={{ opacity: glowOpacity }}
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute -top-40 left-1/2 h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(245_165_36/0.22),transparent_60%)] blur-3xl animate-aurora" />
        <div className="absolute top-20 -right-40 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgb(94_234_212/0.14),transparent_60%)] blur-3xl animate-aurora [animation-delay:-6s]" />
        <div className="bg-grid absolute inset-0" />
      </motion.div>

      <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="text-center lg:text-left">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-muted backdrop-blur"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-ok" />
            </span>
            Live on QIE Mainnet · escrow-protected
          </motion.div>

          <h1 className="mt-6 font-display text-[3.4rem] leading-[0.95] tracking-tight sm:text-7xl lg:text-[5.5rem]">
            <span className="block">
              {line1.map((word, i) => (
                <Word key={word} delay={0.1 + i * 0.08}>
                  {word}
                </Word>
              ))}
            </span>
            <span className="block">
              {line2.map((word, i) => (
                <Word key={word} delay={0.35 + i * 0.08} italic={word !== 'on'}>
                  {word}
                </Word>
              ))}
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7, ease }}
            className="mx-auto mt-6 max-w-lg text-lg text-muted lg:mx-0"
          >
            Mobile airtime and gift cards, paid with QIE or QUSDC. Your money waits in an on-chain
            escrow and moves only when delivery is confirmed.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.85, ease }}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
          >
            <Link
              href="/airtime"
              className="group inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand px-6 font-semibold text-brand-ink shadow-[0_10px_40px_-10px_var(--color-brand)] transition-all duration-200 hover:bg-brand-hover hover:shadow-[0_14px_50px_-8px_var(--color-brand)]"
            >
              Top up a phone
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            <Link
              href="/giftcards"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 font-semibold backdrop-blur transition-colors hover:border-white/25"
            >
              <Gift className="size-4" aria-hidden /> Buy a gift card
            </Link>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.05 }}
            className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-muted lg:justify-start"
          >
            <li className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-accent" aria-hidden /> Funds held on-chain
            </li>
            <li className="flex items-center gap-2">
              <RotateCcw className="size-4 text-accent" aria-hidden /> Automatic refunds
            </li>
          </motion.ul>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1.1, delay: 0.3, ease }}
            style={{ y: phoneY }}
          >
            <PhoneDemo />
          </motion.div>

          {/* Floating objects with their own scroll speed (parallax). Decorative. */}
          <motion.div
            aria-hidden
            style={{ y: cardY }}
            initial={{ opacity: 0, x: -40, rotate: -18 }}
            animate={{ opacity: 1, x: 0, rotate: -12 }}
            transition={{ duration: 1, delay: 0.9, ease }}
            className="absolute top-24 -left-2 hidden w-44 rounded-2xl border border-white/10 bg-gradient-to-br from-brand to-[#b8650a] p-4 text-brand-ink shadow-2xl sm:block sm:-left-14 lg:-left-20 xl:-left-16"
          >
            <p className="text-xs font-semibold opacity-70">GIFT CARD</p>
            <p className="mt-6 font-display text-2xl">$25.00</p>
            <p className="font-mono text-[10px] opacity-60">•••• •••• 4F2A</p>
          </motion.div>
          <motion.div
            aria-hidden
            style={{ y: coinY }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 120, damping: 12, delay: 1.1 }}
            className="absolute top-8 right-0 flex size-16 items-center justify-center rounded-full border border-accent/40 bg-[radial-gradient(circle_at_30%_30%,#8ff5e4,#127a6b)] font-display text-2xl text-bg shadow-[0_0_40px_rgb(94_234_212/0.35)] sm:-right-2 xl:-right-6"
          >
            Q
          </motion.div>
          <motion.div
            aria-hidden
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.3, ease }}
            className="absolute right-0 bottom-24 hidden items-center gap-2 rounded-xl border border-white/10 bg-surface/80 px-3 py-2 text-xs backdrop-blur-xl sm:flex xl:-right-10"
          >
            <ShieldCheck className="size-4 text-ok" /> Refund guaranteed by contract
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Word({
  children,
  delay,
  italic = false,
}: {
  children: string;
  delay: number;
  italic?: boolean;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, y: '0.4em', filter: 'blur(12px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, delay, ease }}
      className={`mr-[0.22em] inline-block ${italic ? 'bg-gradient-to-r from-brand via-[#ffd27a] to-brand bg-clip-text text-transparent italic' : ''}`}
    >
      {children}
    </motion.span>
  );
}
