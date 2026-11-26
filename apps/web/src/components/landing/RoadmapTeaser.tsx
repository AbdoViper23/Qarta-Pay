import Link from 'next/link';
import { PHASES } from '@/lib/roadmap';
import { Reveal } from './Reveal';
import { StatusChip } from './StatusChip';

/** Four phases at a glance, linking to the full roadmap. */
export function RoadmapTeaser() {
  return (
    <section id="roadmap" className="mx-auto max-w-6xl px-4 pb-28">
      <Reveal className="flex flex-col gap-6 border-t-2 border-rule pt-14 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="max-w-[16ch] font-display text-5xl leading-[0.9] font-extrabold uppercase sm:text-6xl">
            Where Qarta Pay is going.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-7 text-muted">
            Airtime and gift cards are the start. Next come data, bills, automation, and a checkout
            other QIE apps can plug into.
          </p>
        </div>
        <Link
          href="/roadmap"
          className="inline-flex min-h-12 items-center self-start border-2 border-ink px-6 text-sm font-semibold transition-colors hover:bg-surface lg:self-auto"
        >
          Full roadmap
        </Link>
      </Reveal>

      <div className="mt-12 grid gap-px border-2 border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
        {PHASES.map((phase, i) => (
          <Reveal key={phase.number} delay={i * 0.05} className="h-full">
            <div className="flex h-full flex-col bg-surface p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-5xl leading-none font-extrabold text-brand">
                  {phase.number}
                </span>
                <StatusChip status={phase.status} />
              </div>
              <p className="mt-5 font-display text-2xl leading-tight font-bold uppercase">
                {phase.name}
              </p>
              <p className="mt-1 font-mono text-xs text-muted">{phase.when}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {phase.items.slice(0, 3).map((item) => (
                  <li key={item.title} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 bg-ink" aria-hidden />
                    {item.title}
                  </li>
                ))}
                {phase.items.length > 3 && (
                  <li className="pl-3.5 text-muted">+{phase.items.length - 3} more</li>
                )}
              </ul>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
