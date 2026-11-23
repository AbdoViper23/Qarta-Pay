'use client';

import { countryName } from '@/lib/format';
import { useAppConfig } from '@/lib/hooks';

/** Shown until the live list arrives from the API. */
const FALLBACK = ['NG', 'GH', 'KE', 'ZA', 'PH', 'IN', 'EG', 'MX', 'BR', 'ID', 'PK', 'TR', 'CO'];

/** Where top-ups work today: every country the API serves, scrolling like a ticker tape. */
export function Marquee() {
  const { data: config } = useAppConfig();
  const live = config?.airtimeCountries ?? [];
  const codes = live.length ? live : FALLBACK;
  const names = codes.map(countryName).sort((a, b) => a.localeCompare(b));
  // Same speed whatever the list length: about 1.6 s per country.
  const duration = `${Math.max(30, names.length * 1.6)}s`;

  return (
    <section aria-label="Countries" className="border-y-2 border-rule bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 py-5 sm:flex-row sm:items-center sm:gap-8">
        <p className="shrink-0 px-4 text-xs font-semibold uppercase sm:pr-0">
          Mobile top-ups in {live.length ? `${live.length} countries` : 'over 150 countries'}
        </p>
        <div className="group relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
          <div
            className="flex w-max animate-marquee group-hover:[animation-play-state:paused] motion-reduce:animate-none"
            style={{ animationDuration: duration }}
          >
            {[0, 1].map((copy) => (
              <ul
                key={copy}
                aria-hidden={copy === 1}
                className="flex shrink-0 items-baseline font-display text-2xl font-bold uppercase"
              >
                {names.map((name) => (
                  <li key={name} className="flex items-baseline whitespace-nowrap">
                    <span className="px-4">{name}</span>
                    <span aria-hidden className="text-brand">
                      ·
                    </span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
