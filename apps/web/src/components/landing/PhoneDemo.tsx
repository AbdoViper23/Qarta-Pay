'use client';

import { CircleCheck, LockKeyhole, Smartphone, Wallet } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import { useEffect, useState, type PointerEvent } from 'react';

/**
 * A phone that plays one Qarta Pay order on a loop: price, wallet confirmation, escrow,
 * delivery. It tilts toward the pointer. Illustration only: no real data.
 */
const STEPS = ['quote', 'confirm', 'escrow', 'delivered'] as const;
type Step = (typeof STEPS)[number];

export function PhoneDemo() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>('quote');
  useEffect(() => {
    if (reduce) return;
    const timer = setInterval(
      () => setStep((s) => STEPS[(STEPS.indexOf(s) + 1) % STEPS.length]!),
      2600,
    );
    return () => clearInterval(timer);
  }, [reduce]);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-14, 14]), {
    stiffness: 120,
    damping: 18,
  });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [10, -10]), {
    stiffness: 120,
    damping: 18,
  });

  function onMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width - 0.5);
    py.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  return (
    <div
      className="relative mx-auto w-[18rem] [perspective:1200px] sm:w-[19rem]"
      onPointerMove={onMove}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className="relative rounded-[2.6rem] border border-white/10 bg-gradient-to-b from-[#1a2131] to-[#0a0e17] p-3 shadow-[0_40px_120px_-30px_rgb(245_165_36/0.35)]"
      >
        <div className="relative h-[34rem] overflow-hidden rounded-[2rem] bg-bg">
          <div className="absolute top-2 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
          <div className="flex items-center justify-between px-6 pt-12 text-xs text-muted">
            <span className="font-mono">qarta.pay</span>
            <span className="flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-ok">
              <span className="size-1.5 rounded-full bg-ok" /> QIE Mainnet
            </span>
          </div>

          <div className="px-5 pt-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -16, filter: 'blur(6px)' }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                <Screen step={step} />
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="absolute inset-x-5 bottom-6 flex gap-1.5">
            {STEPS.map((s) => (
              <span key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <motion.span
                  className="block h-full bg-brand"
                  initial={false}
                  animate={{ width: STEPS.indexOf(s) <= STEPS.indexOf(step) ? '100%' : '0%' }}
                  transition={{ duration: 0.5 }}
                />
              </span>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Screen({ step }: { step: Step }) {
  if (step === 'quote')
    return (
      <div className="space-y-4">
        <p className="font-display text-3xl">Top up</p>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Smartphone className="size-5" />
            </span>
            <div className="text-sm">
              <p className="font-medium">+234 803 ••• 4567</p>
              <p className="text-muted">MTN Nigeria</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            {['₦1,000', '₦1,500', '₦3,000'].map((v, i) => (
              <span
                key={v}
                className={`rounded-lg border py-2 ${i === 1 ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted'}`}
              >
                {v}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-end justify-between rounded-2xl border border-line bg-surface p-4">
          <div>
            <p className="text-xs text-muted">You pay</p>
            <p className="font-mono text-2xl">1.04 QUSDC</p>
          </div>
          <p className="text-xs text-muted">≈ $1.04</p>
        </div>
      </div>
    );
  if (step === 'confirm')
    return (
      <div className="space-y-4">
        <p className="font-display text-3xl">Confirm</p>
        <div className="rounded-2xl border border-line bg-surface p-5 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <Wallet className="size-7" />
          </span>
          <p className="mt-4 text-sm text-muted">QIE Wallet</p>
          <p className="font-mono text-xl">Pay 1.04 QUSDC</p>
          <div className="mt-5 h-11 rounded-xl bg-[linear-gradient(110deg,var(--color-brand),45%,#ffe2a8,55%,var(--color-brand))] bg-[length:200%_100%] animate-shimmer" />
        </div>
      </div>
    );
  if (step === 'escrow')
    return (
      <div className="space-y-4">
        <p className="font-display text-3xl">In escrow</p>
        <div className="relative overflow-hidden rounded-2xl border border-brand/30 bg-brand-soft p-5 text-center">
          <motion.span
            className="mx-auto flex size-16 items-center justify-center rounded-full border border-brand/40 text-brand"
            animate={{ boxShadow: ['0 0 0 0 rgb(245 165 36/0.5)', '0 0 0 18px rgb(245 165 36/0)'] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          >
            <LockKeyhole className="size-7" />
          </motion.span>
          <p className="mt-4 font-mono text-sm text-brand">QartaCheckout</p>
          <p className="text-sm text-muted">Held until your top-up arrives</p>
        </div>
      </div>
    );
  return (
    <div className="space-y-4">
      <p className="font-display text-3xl">Delivered</p>
      <div className="rounded-2xl border border-ok/30 bg-ok-soft p-5 text-center">
        <motion.span
          initial={{ scale: 0.4, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14 }}
          className="mx-auto flex size-16 items-center justify-center rounded-full bg-ok text-bg"
        >
          <CircleCheck className="size-9" />
        </motion.span>
        <p className="mt-4 font-mono text-2xl text-ok">+₦1,500</p>
        <p className="text-sm text-muted">Airtime sent · payment released</p>
      </div>
    </div>
  );
}
