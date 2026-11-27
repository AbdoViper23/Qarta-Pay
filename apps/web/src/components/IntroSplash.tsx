'use client';

import { useEffect, useRef } from 'react';

const SEEN_KEY = 'qarta-intro-seen';

/**
 * Runs in <head> before the first paint. The intro plays once per browser session, on the
 * home page only, and never with reduced motion. It sets html[data-intro="on"], which shows
 * the overlay and hides the header mark (globals.css) until the animation hands over.
 */
export const introScript = `(function(){try{if(location.pathname!=='/')return;if(sessionStorage.getItem('${SEEN_KEY}'))return;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;document.documentElement.dataset.intro='on';}catch(e){}})();`;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const outCubic = (x: number) => 1 - (1 - x) ** 3;
const inOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const backOut = (x: number) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
function bounceOut(x: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x - 1.5 / d) ** 2 + 0.75;
  if (x < 2.5 / d) return n * (x - 2.25 / d) ** 2 + 0.9375;
  return n * (x - 2.625 / d) ** 2 + 0.984375;
}

/** Timeline in seconds: coin drops, card grows around it, strip prints, then the fly. */
const FLY = 1.85;
const FLY_END = FLY + 0.7;

/**
 * "Coin drop" intro: a coin falls and bounces, the card grows around it so the hole opens,
 * the receipt strip prints out in steps, then the mark shrinks and flies into the header
 * (#brand-mark) while the overlay fades. A click skips it.
 */
export function IntroSplash() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const el = root.current;
    if (html.dataset.intro !== 'on' || !el) return;

    const part = <T extends Element>(name: string) =>
      el.querySelector(`[data-part="${name}"]`) as T;
    const mark = part<SVGSVGElement>('mark');
    const card = part<SVGGElement>('card');
    const strip = part<SVGRectElement>('strip');
    const coin = part<SVGCircleElement>('coin');
    const word = part<HTMLParagraphElement>('word');
    const backdrop = part<HTMLDivElement>('backdrop');

    let raf = 0;
    let flight: { dx: number; dy: number; scale: number } | null = null;
    const finish = () => {
      cancelAnimationFrame(raf);
      try {
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {
        // storage blocked: the intro may play again next time
      }
      delete html.dataset.intro;
    };

    const start = performance.now();
    const frame = (now: number) => {
      const t = (now - start) / 1000;

      // 1. The coin falls from above the mark and bounces to rest (SVG units).
      coin.setAttribute('cy', String(114 - 520 * (1 - bounceOut(seg(t, 0, 0.6)))));
      // 2. The card grows around the coin, which opens the hole.
      const grow = seg(t, 0.62, 1.05);
      card.style.opacity = grow > 0 ? '1' : '0';
      card.setAttribute(
        'transform',
        `translate(118 114) scale(${lerp(0.28, 1, backOut(grow))}) translate(-118 -114)`,
      );
      // 3. The receipt strip prints out in short steps.
      const p = seg(t, 1.1, 1.6);
      strip.setAttribute('width', String(111 * (p >= 1 ? 1 : Math.floor(p * 7) / 7)));
      const wordIn = outCubic(seg(t, 1.3, 1.6)) * (1 - seg(t, FLY, FLY + 0.2));
      word.style.opacity = String(wordIn);

      // 4. Fly into the header mark and reveal the page.
      if (t >= FLY) {
        if (!flight) {
          const from = mark.getBoundingClientRect();
          const to = document.getElementById('brand-mark')?.getBoundingClientRect();
          flight = to
            ? {
                dx: to.left + to.width / 2 - (from.left + from.width / 2),
                dy: to.top + to.height / 2 - (from.top + from.height / 2),
                scale: to.width / from.width,
              }
            : { dx: 0, dy: 0, scale: 1 };
        }
        const f = inOutCubic(seg(t, FLY, FLY_END));
        mark.style.transform = `translate(${flight.dx * f}px, ${flight.dy * f}px) scale(${lerp(1, flight.scale, f)})`;
        backdrop.style.opacity = String(1 - seg(t, FLY + 0.15, FLY_END));
      }

      if (t >= FLY_END + 0.05) finish();
      else raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    el.addEventListener('click', finish);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('click', finish);
    };
  }, []);

  return (
    <div ref={root} className="intro fixed inset-0 z-50 cursor-pointer" aria-hidden>
      <div data-part="backdrop" className="absolute inset-0 bg-bg" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
        <svg
          data-part="mark"
          viewBox="28 28 200 200"
          overflow="visible"
          className="size-40 sm:size-44"
          style={{ transformOrigin: '50% 50%' }}
        >
          <g data-part="card" style={{ opacity: 0 }}>
            <rect x="28" y="28" width="200" height="200" rx="40" fill="var(--color-brand)" />
            {/* The hole and the strip are drawn in the page colour over the card. */}
            <circle cx="118" cy="114" r="58" fill="var(--color-bg)" />
            <rect data-part="strip" x="118" y="146" width="0" height="26" fill="var(--color-bg)" />
          </g>
          <circle data-part="coin" cx="118" cy="-406" r="30" fill="var(--color-brand)" />
        </svg>
        <p
          data-part="word"
          className="font-display text-4xl font-extrabold tracking-wide uppercase"
          style={{ opacity: 0 }}
        >
          Qarta Pay
        </p>
      </div>
    </div>
  );
}
