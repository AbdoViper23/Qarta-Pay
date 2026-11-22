'use client';

import { CircleCheck, LockKeyhole, RotateCcw, Wallet } from 'lucide-react';
import { motion, useMotionValueEvent, useScroll, useTransform } from 'motion/react';
import { useRef, useState } from 'react';
import { SectionTitle } from './Reveal';

/**
 * Scroll-driven story of one payment: the section pins while a coin travels from the wallet
 * into the escrow and out to delivery, and the copy follows the coin.
 */
const STEPS = [
  {
    icon: Wallet,
    title: 'You pay',
    text: 'Pick a product, see one all-in price, and pay from QIE Wallet in QIE or QUSDC.',
  },
  {
    icon: LockKeyhole,
    title: 'The contract holds it',
    text: 'Your payment sits in the QartaCheckout escrow on QIE Mainnet. Not with us. Not yet.',
  },
  {
    icon: CircleCheck,
    title: 'Delivered, then released',
    text: 'The top-up lands or the code appears. Only then is the payment released.',
  },
  {
    icon: RotateCcw,
    title: 'Or it comes back',
    text: 'Delivery failed? The contract refunds you. If we go silent for two hours, take it back yourself.',
  },
];

export function EscrowStory() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) =>
    setActive(Math.min(STEPS.length - 1, Math.floor(v * STEPS.length))),
  );
  const fill = useTransform(scrollYProgress, [0.05, 0.95], ['0%', '100%']);
  const coinLeft = useTransform(scrollYProgress, [0.05, 0.7], ['0%', '100%']);

  return (
    <section
      ref={ref}
      id="escrow"
      className="relative h-[320vh]"
      aria-label="How escrow protects you"
    >
      <div className="sticky top-0 flex h-dvh flex-col justify-center overflow-hidden px-4">
        <SectionTitle
          eyebrow="How your money is protected"
          title={
            <>
              Trust the contract, <span className="text-brand italic">not the promise.</span>
            </>
          }
        />

        <div className="mx-auto mt-14 w-full max-w-4xl">
          {/* Track with the travelling coin. */}
          <div className="relative mx-6 h-1 rounded-full bg-white/10">
            <motion.div
              style={{ width: fill }}
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand to-accent"
            />
            <motion.div
              style={{ left: coinLeft }}
              className="absolute top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand/60 bg-[radial-gradient(circle_at_30%_30%,#ffe2a8,var(--color-brand))] shadow-[0_0_30px_var(--color-brand)]"
              aria-hidden
            />
          </div>

          <ol className="mt-10 grid gap-4 sm:grid-cols-4">
            {STEPS.map((step, i) => {
              const on = i <= active;
              const Icon = step.icon;
              return (
                <li
                  key={step.title}
                  className={`rounded-2xl border p-5 transition-all duration-500 ${i === active ? '' : 'hidden sm:block'} ${
                    i === active
                      ? 'border-brand/50 bg-brand-soft shadow-[0_20px_60px_-25px_var(--color-brand)]'
                      : on
                        ? 'border-line bg-surface'
                        : 'border-line/60 bg-surface/40 opacity-50'
                  }`}
                >
                  <span
                    className={`flex size-10 items-center justify-center rounded-xl transition-colors duration-500 ${on ? 'bg-brand text-brand-ink' : 'bg-white/5 text-muted'}`}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <p className="mt-4 font-semibold">
                    <span className="mr-2 font-mono text-xs text-muted">0{i + 1}</span>
                    {step.title}
                  </p>
                  <p className="mt-1 text-sm text-muted">{step.text}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
