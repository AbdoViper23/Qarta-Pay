import { Sparkle } from 'lucide-react';

/** Endless strip of where and what you can buy. Pure CSS; pauses on hover. */
const ITEMS = [
  'Nigeria',
  'Ghana',
  'Kenya',
  'South Africa',
  'Philippines',
  'India',
  'Egypt',
  'Airtime in seconds',
  'Gift cards',
  'Paid in QIE',
  'Paid in QUSDC',
];

export function Marquee() {
  const row = [...ITEMS, ...ITEMS];
  return (
    <div
      className="relative overflow-hidden border-y border-line py-5 [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]"
      aria-label="Countries and products"
    >
      <ul className="flex w-max animate-marquee gap-10 hover:[animation-play-state:paused]">
        {row.map((item, i) => (
          <li
            key={`${item}-${i}`}
            aria-hidden={i >= ITEMS.length}
            className="flex items-center gap-10 font-display text-2xl whitespace-nowrap text-ink/70 italic"
          >
            {item}
            <Sparkle className="size-4 text-brand/70" aria-hidden />
          </li>
        ))}
      </ul>
    </div>
  );
}
