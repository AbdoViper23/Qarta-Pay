'use client';

import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Reveal } from './Reveal';

/** Product facts (not traction): each number counts up when it comes into view. */
const FACTS = [
  { value: 100, suffix: '%', label: 'of every payment held on-chain until delivery' },
  { value: 2, suffix: 'h', label: 'until you can reclaim a stuck payment yourself' },
  { value: 7, suffix: '', label: 'countries for mobile top-ups at launch' },
];

export function Facts() {
  return (
    <section id="facts" className="mx-auto max-w-5xl px-4 pb-28">
      <div className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-3">
        {FACTS.map((fact, i) => (
          <Reveal key={fact.label} delay={i * 0.08} className="bg-bg p-8 text-center sm:text-left">
            <p className="font-display text-6xl tracking-tight">
              <CountUp to={fact.value} />
              <span className="text-brand">{fact.suffix}</span>
            </p>
            <p className="mt-2 text-sm text-muted">{fact.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? to : 0);
  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, to, {
      duration: 1.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, reduce, to]);
  return <span ref={ref}>{value}</span>;
}
