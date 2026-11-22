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
    <section id="facts" className="mx-auto max-w-6xl px-4 pb-28">
      <div className="grid border-y-2 border-rule bg-surface sm:grid-cols-3 sm:divide-x sm:divide-dashed sm:divide-muted">
        {FACTS.map((fact, i) => (
          <Reveal
            key={fact.label}
            delay={i * 0.06}
            className="dashed-b px-6 py-8 last:border-b-0 sm:border-b-0 sm:px-8"
          >
            <p className="font-display text-7xl leading-none font-extrabold">
              <CountUp to={fact.value} />
              <span className="text-brand">{fact.suffix}</span>
            </p>
            <p className="mt-3 max-w-[16rem] text-xs leading-5 text-muted uppercase">
              {fact.label}
            </p>
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
