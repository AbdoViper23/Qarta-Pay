'use client';

import { useEffect, useRef, useState } from 'react';
import { CHAPTER_STARTS, TokenScene } from './tokenScene';

/**
 * Pinned scroll story of one payment (drawing in tokenScene.ts): the token is held in the
 * escrow while the top-up is delivered, re-forms as airtime or a gift card on the phone, or
 * goes back to the wallet as a refund.
 */
const CHAPTERS = [
  {
    label: 'Wallet',
    title: 'It starts as a token.',
    text: "1.04 QUSDC sits in your wallet. Real value, but it can't top up a phone on its own.",
  },
  {
    label: 'Escrow',
    title: 'It waits in the contract.',
    text: "You pay, and the token drops into the QartaCheckout escrow on QIE Mainnet. Nobody can spend it while it's locked, including us.",
  },
  {
    label: 'Delivery',
    title: 'Delivery happens first.',
    text: 'We send the top-up through Reloadly. The contract lets go of the payment only once the delivery lands.',
  },
  {
    label: 'Arrival',
    title: 'Same value, new shape.',
    text: 'The token arrives as ₦1,500 of airtime on their phone, or as a gift card code in your hand.',
  },
  {
    label: 'Refund',
    title: 'Or it comes back.',
    text: 'If delivery fails, the escrow sends the token straight back to your wallet. After two hours you can reclaim it yourself.',
  },
];

const chapterAt = (p: number) => {
  let k = 0;
  while (k < CHAPTERS.length - 1 && p >= CHAPTER_STARTS[k + 1]!) k += 1;
  return k;
};
const two = (n: number) => String(n).padStart(2, '0');

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
    let chapter = -1;
    let before = 0;

    const read = () => {
      const r = el.getBoundingClientRect();
      target = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
    };
    const paint = (time: number) => {
      scene.draw(shown, time);
      const k = chapterAt(shown);
      if (k !== chapter) {
        chapter = k;
        setActive(k);
      }
      rail.current.forEach((bar, i) => {
        const t = (shown - CHAPTER_STARTS[i]!) / (CHAPTER_STARTS[i + 1]! - CHAPTER_STARTS[i]!);
        if (bar) bar.style.transform = `scaleX(${Math.min(1, Math.max(0, t))})`;
      });
    };
    const tick = (time: number) => {
      // The scene trails the scrollbar a little, at the same speed on any refresh rate.
      const dt = Math.min(64, time - before);
      before = time;
      shown = reduce ? target : shown + (target - shown) * (1 - Math.exp(-dt / 110));
      paint(time);
      if (visible) frame = requestAnimationFrame(tick);
    };
    // Draw only while the section is on screen.
    const io = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      cancelAnimationFrame(frame);
      before = performance.now();
      if (visible) frame = requestAnimationFrame(tick);
    });
    io.observe(el);
    const onResize = () => {
      scene.resize();
      paint(performance.now());
    };
    const sized = new ResizeObserver(onResize);
    sized.observe(cv);
    // Light and dark mode: the scene reads its colours from the page.
    const themed = new MutationObserver(() => {
      scene.readTheme();
      paint(performance.now());
    });
    themed.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('scroll', read, { passive: true });
    void document.fonts?.ready.then(onResize);
    read();
    shown = target;
    paint(0);
    return () => {
      io.disconnect();
      sized.disconnect();
      themed.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', read);
    };
  }, []);

  /** Scrolls to the point of chapter i where its picture has settled. */
  const jump = (i: number) => {
    const el = section.current;
    if (!el) return;
    const p = CHAPTER_STARTS[i]! + (CHAPTER_STARTS[i + 1]! - CHAPTER_STARTS[i]!) * 0.7;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + p * (el.offsetHeight - window.innerHeight) });
  };

  return (
    <section
      ref={section}
      id="escrow"
      className="relative h-[560vh]"
      aria-label="How escrow protects you"
    >
      <div className="sticky top-0 mx-auto grid h-dvh max-w-6xl grid-rows-[auto_1fr] content-start gap-2 px-4 pt-20 pb-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:grid-rows-1 md:content-center md:items-center md:gap-8 md:pt-20 md:pb-4">
        <div className="min-w-0">
          <p className="flex items-center justify-between gap-4 text-xs font-semibold uppercase md:justify-start">
            <span>
              <span className="mr-2 inline-block size-2 bg-brand align-middle" aria-hidden />
              How escrow protects you
            </span>
            <span className="tabular-nums text-muted" aria-hidden>
              <span className="text-brand">{two(active + 1)}</span> / {two(CHAPTERS.length)}
            </span>
          </p>

          {/* Screen readers get the whole story as a list; the stack below is the visual copy. */}
          <ol className="sr-only">
            {CHAPTERS.map((chapter) => (
              <li key={chapter.title}>
                <h3>{chapter.title}</h3>
                <p>{chapter.text}</p>
              </li>
            ))}
          </ol>
          {/* All five share one grid cell, so the block is as tall as the longest chapter. */}
          <div aria-hidden className="mt-3 grid md:mt-5">
            {CHAPTERS.map((chapter, i) => (
              <div
                key={chapter.title}
                className={`col-start-1 row-start-1 transition-[opacity,translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  i === active
                    ? 'translate-y-0 opacity-100'
                    : `opacity-0 ${i < active ? '-translate-y-5' : 'translate-y-5'}`
                }`}
              >
                <h2 className="font-display text-[2.6rem] leading-[0.9] font-extrabold uppercase text-balance sm:text-5xl md:text-6xl lg:text-7xl [@media(max-height:560px)]:text-4xl">
                  {chapter.title}
                </h2>
                <p className="mt-3 max-w-md text-[13px] leading-6 text-muted md:mt-5 md:text-[15px] md:leading-7 [@media(max-height:560px)]:mt-2 [@media(max-height:560px)]:text-xs">
                  {chapter.text}
                </p>
              </div>
            ))}
          </div>

          <ol className="mt-2 flex gap-1.5 md:mt-5">
            {CHAPTERS.map((chapter, i) => (
              <li key={chapter.title} className="max-w-20 flex-1">
                <button
                  type="button"
                  onClick={() => jump(i)}
                  aria-label={`Step ${i + 1} of ${CHAPTERS.length}: ${chapter.title}`}
                  aria-current={i === active ? 'step' : undefined}
                  className="group block w-full py-2 text-left"
                >
                  <span className="block h-1 overflow-hidden bg-line">
                    <span
                      ref={(node) => {
                        rail.current[i] = node;
                      }}
                      style={{ transform: 'scaleX(0)' }}
                      className={`block h-full origin-left ${i === active ? 'bg-brand' : 'bg-ink'}`}
                    />
                  </span>
                  <span
                    className={`mt-2 hidden text-[10px] font-semibold tracking-wider uppercase transition-colors sm:block ${
                      i === active ? 'text-ink' : 'text-muted group-hover:text-ink'
                    }`}
                  >
                    {chapter.label}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <canvas
          ref={canvas}
          role="img"
          aria-label="A red coin lifts out of a wallet, breaks into dots and drops into an escrow safe that locks and is stamped HELD. The phone shows the top-up being sent; once it is delivered the safe opens and the dots re-form on the phone as airtime, then as a gift card. In the other ending delivery fails and the dots return to the wallet, stamped REFUNDED."
          className="h-full min-h-0 w-full md:h-[min(84vh,700px)]"
        />
      </div>
    </section>
  );
}
