import Link from 'next/link';
import { Reveal } from './Reveal';

export function FinalCta() {
  return (
    <section id="start" className="mx-auto max-w-6xl px-4 pb-32">
      <Reveal className="flex flex-col gap-10 border-t border-line pt-16 lg:flex-row lg:items-end lg:justify-between">
        <h2 className="max-w-[14ch] font-display text-5xl leading-[1.02] font-light tracking-tight text-balance sm:text-6xl">
          Turn your QIE into something real.
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/airtime"
            className="inline-flex min-h-12 items-center rounded-full bg-ink px-7 font-medium text-bg transition-colors hover:bg-white"
          >
            Start with a top-up
          </Link>
          <Link
            href="/about"
            className="inline-flex min-h-12 items-center rounded-full border border-line px-7 font-medium transition-colors hover:border-ink/40"
          >
            How it works
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
