import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Reveal } from './Reveal';

export function FinalCta() {
  return (
    <section id="start" className="mx-auto max-w-5xl px-4 pb-28">
      <Reveal>
        <div className="glow-border relative overflow-hidden rounded-3xl bg-surface px-6 py-16 text-center sm:px-12">
          <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(245_165_36/0.25),transparent_65%)] blur-2xl" />
          <h2 className="relative font-display text-4xl leading-tight tracking-tight sm:text-6xl">
            Turn your QIE into
            <br />
            <span className="text-brand italic">something real.</span>
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-muted">
            Connect QIE Wallet, pick a top-up or a gift card, and watch the escrow do its job.
          </p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/airtime"
              className="group inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand px-6 font-semibold text-brand-ink transition-colors hover:bg-brand-hover"
            >
              Start with a top-up
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            <Link
              href="/about"
              className="inline-flex min-h-12 items-center rounded-xl px-6 font-semibold text-muted transition-colors hover:text-ink"
            >
              How it works
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
