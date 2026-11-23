import Link from 'next/link';
import { Reveal } from './Reveal';

export function FinalCta() {
  return (
    <section id="start" className="mx-auto max-w-6xl px-4 pb-32">
      <Reveal className="flex flex-col gap-10 border-t-2 border-rule pt-14 lg:flex-row lg:items-end lg:justify-between">
        <h2 className="max-w-[16ch] font-display text-6xl leading-[0.88] font-extrabold uppercase sm:text-7xl">
          Turn your QIE into something real.
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/airtime"
            className="inline-flex min-h-12 items-center border-2 border-ink bg-ink px-6 text-sm font-semibold text-surface transition-colors hover:bg-ink-hover"
          >
            Start with a top-up
          </Link>
          <Link
            href="/about"
            className="inline-flex min-h-12 items-center border-2 border-ink px-6 text-sm font-semibold transition-colors hover:bg-surface"
          >
            How it works
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
