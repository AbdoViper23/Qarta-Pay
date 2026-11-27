'use client';

import { useAnimate } from 'motion/react';
import { useEffect, useRef } from 'react';

const SEEN_KEY = 'qarta-intro-seen';

/**
 * Runs in <head> before the first paint. The intro plays once per browser session, on the
 * home page only, and never with reduced motion. It sets html[data-intro="on"], which shows
 * the overlay and hides the header mark (globals.css) until the animation hands over.
 */
export const introScript = `(function(){try{if(location.pathname!=='/')return;if(sessionStorage.getItem('${SEEN_KEY}'))return;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;document.documentElement.dataset.intro='on';}catch(e){}})();`;

/**
 * The logo builds itself in the middle of the screen: the card appears, the hole opens
 * around the coin, the receipt strip unrolls. Then the mark shrinks and flies into the
 * header (#brand-mark) while the overlay fades. A click skips it.
 */
export function IntroSplash() {
  const [scope, animate] = useAnimate();
  const done = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.intro !== 'on') return;

    const finish = () => {
      if (done.current) return;
      done.current = true;
      try {
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {
        // storage blocked: the intro may play again next time
      }
      delete root.dataset.intro;
    };

    const run = async () => {
      const ease = [0.22, 1, 0.36, 1] as const;
      await animate(
        '[data-part="card"]',
        { scale: [0.5, 1.06, 1], opacity: [0, 1] },
        { duration: 0.5, ease },
      );
      await animate('[data-part="hole"]', { scale: [0, 1] }, { duration: 0.38, ease });
      animate('[data-part="word"]', { opacity: [0, 1], y: [8, 0] }, { duration: 0.35, ease });
      await animate('[data-part="strip"]', { scaleX: [0, 1] }, { duration: 0.36, ease });
      await new Promise((r) => setTimeout(r, 260));

      // Fly into the header mark.
      const mark = scope.current?.querySelector('[data-part="mark"]') as HTMLElement | null;
      const target = document.getElementById('brand-mark');
      if (mark && target) {
        const from = mark.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        animate('[data-part="word"]', { opacity: 0 }, { duration: 0.2 });
        animate('[data-part="backdrop"]', { opacity: 0 }, { duration: 0.55, delay: 0.15 });
        await animate(
          mark,
          {
            x: to.left + to.width / 2 - (from.left + from.width / 2),
            y: to.top + to.height / 2 - (from.top + from.height / 2),
            scale: to.width / from.width,
          },
          { duration: 0.7, ease: [0.65, 0, 0.35, 1] },
        );
      }
      finish();
    };
    void run();

    const skip = () => finish();
    const el = scope.current as HTMLElement | null;
    el?.addEventListener('click', skip);
    return () => el?.removeEventListener('click', skip);
  }, [animate, scope]);

  return (
    <div ref={scope} className="intro fixed inset-0 z-50 cursor-pointer" aria-hidden>
      <div data-part="backdrop" className="absolute inset-0 bg-bg" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
        <svg
          data-part="mark"
          viewBox="28 28 200 200"
          className="size-40 sm:size-44"
          style={{ transformOrigin: '50% 50%' }}
        >
          <g data-part="card" style={{ transformOrigin: '128px 128px', opacity: 0 }}>
            <rect x="28" y="28" width="200" height="200" rx="40" fill="var(--color-brand)" />
            {/* The hole and the strip are drawn in the page colour over the card. */}
            <circle
              data-part="hole"
              cx="118"
              cy="114"
              r="58"
              fill="var(--color-bg)"
              style={{ transformOrigin: '118px 114px', transform: 'scale(0)' }}
            />
            <rect
              data-part="strip"
              x="118"
              y="146"
              width="111"
              height="26"
              fill="var(--color-bg)"
              style={{ transformOrigin: '118px 159px', transform: 'scaleX(0)' }}
            />
            <circle cx="118" cy="114" r="30" fill="var(--color-brand)" />
          </g>
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
