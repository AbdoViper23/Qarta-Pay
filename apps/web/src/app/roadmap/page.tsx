import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '@/components/landing/Reveal';
import { StatusChip } from '@/components/landing/StatusChip';
import { PHASES } from '@/lib/roadmap';

export const metadata: Metadata = {
  title: 'Roadmap · Qarta Pay',
  description:
    'What Qarta Pay ships today and what comes next: data bundles, bill payments, auto top-up and a checkout for QIE apps.',
};

/** Why the business holds up, in plain claims a reader can check against the product. */
const MODEL = [
  {
    title: 'Revenue on every order',
    text: 'A small fee on top of the product cost, shown before payment, plus the wholesale discount our supplier gives us. Both grow with volume.',
  },
  {
    title: 'No chargebacks',
    text: 'Payment is final on-chain before we deliver. Chargeback fraud, the main loss of card-funded gift card shops, does not exist here.',
  },
  {
    title: 'One checkout, many products',
    text: 'Airtime, data, gift cards and bills all use the same escrow contract and checkout. Each new product is mostly catalogue work.',
  },
  {
    title: 'Value stays on QIE',
    text: 'Revenue settles in QUSDC through QIEDex. Every order brings real spending to QIE and QUSDC.',
  },
  {
    title: 'Numbers anyone can verify',
    text: 'Orders, volume and paying wallets are on the live stats page, and every one of them is a transaction on the QIE explorer.',
  },
];

export default function RoadmapPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-32 pb-28">
      <Reveal>
        <p className="text-xs font-semibold uppercase">
          <span className="mr-2 inline-block size-2 bg-brand align-middle" aria-hidden />
          Roadmap
        </p>
        <h1 className="mt-5 max-w-[14ch] font-display text-6xl leading-[0.86] font-extrabold uppercase sm:text-8xl">
          Built to keep growing.
        </h1>
        <p className="mt-7 max-w-xl text-sm leading-7 text-muted sm:text-[15px]">
          Phase 1 is live on QIE Mainnet today. The phases after it are our plan, with target dates.
          Each one adds products people already pay for every month, on the same escrow and
          checkout.
        </p>
      </Reveal>

      <ol className="mt-16 border-t-2 border-rule">
        {PHASES.map((phase) => (
          <li key={phase.number} className="dashed-b">
            <Reveal className="grid gap-8 py-12 lg:grid-cols-[18rem_1fr] lg:gap-14">
              <div>
                <div className="flex items-center gap-4">
                  <span className="font-display text-7xl leading-none font-extrabold text-brand">
                    {phase.number}
                  </span>
                  <StatusChip status={phase.status} />
                </div>
                <h2 className="mt-4 font-display text-4xl leading-none font-extrabold uppercase">
                  {phase.name}
                </h2>
                <p className="mt-2 font-mono text-sm text-muted">{phase.when}</p>
                <p className="mt-4 max-w-xs text-sm leading-6 text-muted">{phase.summary}</p>
              </div>
              <dl className="grid gap-px self-start border-2 border-rule bg-rule sm:grid-cols-2">
                {phase.items.map((item) => (
                  <div
                    key={item.title}
                    className="bg-surface p-5 sm:[&:last-child:nth-child(odd)]:col-span-2"
                  >
                    <dt className="font-display text-xl leading-tight font-bold uppercase">
                      {item.title}
                    </dt>
                    <dd className="mt-2 text-sm leading-6 text-muted">{item.text}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </li>
        ))}
      </ol>

      <section className="mt-24">
        <Reveal>
          <h2 className="max-w-[16ch] font-display text-5xl leading-[0.9] font-extrabold uppercase sm:text-6xl">
            A business, not a demo.
          </h2>
          <p className="mt-5 max-w-xl text-sm leading-7 text-muted">
            Qarta Pay earns on every order from day one, so it can keep running and keep shipping
            after the hackathon.
          </p>
        </Reveal>
        <div className="mt-10 grid border-t-2 border-rule sm:grid-cols-2 lg:grid-cols-3">
          {MODEL.map((point, i) => (
            <Reveal key={point.title} delay={i * 0.04} className="dashed-b py-7 sm:pr-8">
              <p className="font-mono text-xs text-brand">0{i + 1}</p>
              <h3 className="mt-2 font-display text-2xl font-bold uppercase">{point.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{point.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal className="mt-24 flex flex-col gap-8 border-t-2 border-rule pt-14 lg:flex-row lg:items-end lg:justify-between">
        <p className="max-w-[18ch] font-display text-5xl leading-[0.9] font-extrabold uppercase sm:text-6xl">
          Phase 1 is live. Try it.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/airtime"
            className="inline-flex min-h-12 items-center border-2 border-ink bg-ink px-6 text-sm font-semibold text-surface transition-colors hover:bg-ink-hover"
          >
            Top up a phone
          </Link>
          <Link
            href="/stats"
            className="inline-flex min-h-12 items-center border-2 border-ink px-6 text-sm font-semibold transition-colors hover:bg-surface"
          >
            Live stats
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
