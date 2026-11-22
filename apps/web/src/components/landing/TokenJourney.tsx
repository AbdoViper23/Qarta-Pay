'use client';

import { useEffect, useRef, useState } from 'react';
import { TokenScene } from './tokenScene';

/**
 * Pinned scroll story of one payment (drawing in tokenScene.ts): the token waits in the
 * escrow, re-forms as airtime or a gift card on a phone, or flies back as a refund.
 */
const CHAPTERS = [
  {
    title: 'It starts as a token.',
    text: "1.04 QUSDC sits in your wallet. Real value, but it can't top up a phone on its own.",
  },
  {
    title: 'It waits in the contract.',
    text: "You pay, and the token drops into the QartaCheckout escrow on QIE Mainnet. Nobody can spend it while it's locked, including us.",
  },
  {
    title: 'Delivery happens first.',
    text: 'We send the top-up through Reloadly. The contract lets go of the payment only once the delivery lands.',
  },
  {
    title: 'Same value, new shape.',
    text: 'The token arrives as ₦1,500 of airtime on their phone, or as a gift card code in your hand.',
  },
  {
    title: 'Or it comes back.',
    text: 'If delivery fails, the escrow sends the token straight back to your wallet. After two hours you can reclaim it yourself.',
  },
];

/** Where each chapter starts on the scene timeline (tokenScene.ts). */
const STARTS = [0, 0.1, 0.42, 0.58, 0.84, 1];
const chapterAt = (p: number) => {
  let k = 0;
  while (k < CHAPTERS.length - 1 && p >= STARTS[k + 1]!) k += 1;
  return k;
};

export function TokenJourney() {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rail = useRef<(HTMLSpanElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = section.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = new TokenScene(cv, reduce);
    let target = 0;
    let shown = 0;
    let frame = 0;
    let visible = false;
    let last = -1;

    const read = () => {
      const r = el.getBoundingClientRect();
      target = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
    };
    const tick = (time: number) => {
      shown = reduce ? target : shown + (target - shown) * 0.12;
      scene.draw(shown, time);
      const k = chapterAt(shown);
      if (k !== last) {
        last = k;
        setActive(k);
      }
      rail.current.forEach((bar, i) => {
        const t = (shown - STARTS[i]!) / (STARTS[i + 1]! - STARTS[i]!);
        if (bar) bar.style.width = `${Math.min(1, Math.max(0, t)) * 100}%`;
      });
      if (visible) frame = requestAnimationFrame(tick);
    };
    // Draw only while the section is on screen.
    const io = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      cancelAnimationFrame(frame);
      if (visible) frame = requestAnimationFrame(tick);
    });
    io.observe(el);
    const onResize = () => scene.resize();
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', onResize);
    void document.fonts?.ready.then(onResize);
    read();
    shown = target;
    scene.draw(shown, 0);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', read);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <section
      ref={section}
      id="escrow"
      className="relative h-[560vh]"
      aria-label="How escrow protects you"
    >
      <div className="sticky top-0 mx-auto grid h-dvh max-w-6xl grid-rows-[auto_1fr] content-start gap-2 px-4 pt-24 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:grid-rows-1 md:content-center md:items-center md:gap-8 md:pt-20 md:pb-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tabular-nums uppercase">
            <span className="text-brand">{active + 1}</span> of {CHAPTERS.length}
          </p>
          <div className="relative mt-3 min-h-44 md:min-h-60 [@media(max-height:560px)]:min-h-36">
            {CHAPTERS.map((chapter, i) => (
              <article
                key={chapter.title}
                aria-hidden={i !== active}
                className={`absolute inset-0 transition-all duration-500 ${i === active ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
              >
                <h2 className="font-display text-5xl leading-[0.9] font-extrabold uppercase text-balance md:text-6xl lg:text-7xl [@media(max-height:560px)]:text-4xl">
                  {chapter.title}
                </h2>
                <p className="mt-4 max-w-md text-sm leading-7 text-muted md:text-[15px] [@media(max-height:560px)]:mt-2 [@media(max-height:560px)]:text-xs">
                  {chapter.text}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-4 flex gap-1.5" aria-hidden>
            {CHAPTERS.map((chapter, i) => (
              <span key={chapter.title} className="h-1 max-w-14 flex-1 overflow-hidden bg-line">
                <span
                  ref={(node) => {
                    rail.current[i] = node;
                  }}
                  className="block h-full w-0 bg-ink"
                />
              </span>
            ))}
          </div>
        </div>
        <canvas
          ref={canvas}
          role="img"
          aria-label="A token moves from a wallet into an escrow vault, then becomes airtime and a gift card on a phone held in a hand, or flies back to the wallet as a refund."
          className="h-full min-h-0 w-full md:h-[min(80vh,660px)]"
        />
      </div>
    </section>
  );
}
