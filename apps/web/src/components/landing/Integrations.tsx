'use client';

import {
  ArrowLeftRight,
  AtSign,
  Coins,
  Gauge,
  LockKeyhole,
  ScanSearch,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { PointerEvent } from 'react';
import { Reveal, SectionTitle } from './Reveal';

/** Bento of the QIE pieces the product uses; each card lights up under the pointer. */
const CARDS: { icon: LucideIcon; title: string; text: string; wide?: boolean }[] = [
  {
    icon: LockKeyhole,
    title: 'On-chain escrow',
    text: 'QartaCheckout on QIE Mainnet holds every payment until delivery. Refunds keep working even when sales are paused.',
    wide: true,
  },
  { icon: Wallet, title: 'QIE Wallet', text: 'Connect in one tap. It is listed first.' },
  { icon: Coins, title: 'QIE and QUSDC', text: 'Pay with the native coin or the stablecoin.' },
  {
    icon: Gauge,
    title: 'Oracle guard',
    text: 'Every QIE payment is checked on-chain against the QIE/USD price feed.',
  },
  {
    icon: ArrowLeftRight,
    title: 'QIEDEX price check',
    text: 'Prices use the lower of oracle and pool, and pause if the two disagree.',
  },
  { icon: AtSign, title: 'QIE ID', text: 'Your .qie name instead of a hex address.' },
  {
    icon: ScanSearch,
    title: 'Public on the explorer',
    text: 'Every payment, delivery release and refund is a transaction anyone can check on the QIE explorer.',
    wide: true,
  },
];

export function Integrations() {
  function track(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }

  return (
    <section id="built-on-qie" className="mx-auto max-w-5xl px-4 py-28">
      <SectionTitle
        eyebrow="Built on QIE"
        title={
          <>
            Every layer, <span className="text-brand italic">on-chain.</span>
          </>
        }
        text="The QIE building blocks behind every order."
      />
      <div className="mt-14 grid gap-4 sm:grid-cols-3">
        {CARDS.map((card, i) => {
          const Icon = card.icon;
          return (
            <Reveal key={card.title} delay={i * 0.06} className={card.wide ? 'sm:col-span-2' : ''}>
              <article
                onPointerMove={track}
                className="spotlight group h-full rounded-2xl border border-line p-6 transition-colors duration-300 hover:border-brand/40"
              >
                <span className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-brand transition-transform duration-300 group-hover:-translate-y-0.5">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{card.title}</h3>
                <p className="mt-1 text-sm text-muted">{card.text}</p>
              </article>
            </Reveal>
          );
        })}
      </div>
      <Reveal className="mt-8 text-center">
        <Link
          href="/powered-by-qie"
          className="text-sm text-muted underline decoration-white/20 underline-offset-4 transition-colors hover:text-ink"
        >
          See the contracts and addresses
        </Link>
      </Reveal>
    </section>
  );
}
