'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useAppConfig } from '@/lib/hooks';
import { Reveal } from './Reveal';

export const REPO_URL = 'https://github.com/AbdoViper23/Qarta-Pay';

/** Why a buyer can trust a crypto shop they have never heard of: each point is checkable. */
export function Trust() {
  const { data: config } = useAppConfig();
  const fee = config?.pricing.feePercent;
  const buffer = config?.pricing.qieBufferPercent;

  const POINTS = [
    {
      title: 'Your money waits in a contract',
      text: 'Your payment goes to an escrow contract on QIE Mainnet, not to us. It is released to the shop only after delivery.',
    },
    {
      title: 'Refunds without asking us',
      text: 'If delivery fails, the contract refunds you automatically. If nothing happens for 2 hours, you take your payment back yourself.',
    },
    {
      title: 'The price you see is what you pay',
      text: `Product cost plus a ${fee ?? '…'}% fee, shown line by line before you pay. Nothing is added later.${
        config && config.pricing.freeOrdersPerWallet > 0
          ? ` Your first ${config.pricing.freeOrdersPerWallet} orders have no fee at all.`
          : ''
      }${buffer ? ` Paying in QIE adds ${buffer}% in case the price moves while you pay.` : ''}`,
    },
    {
      title: 'Check everything',
      text: 'The contract is open source and verified. Every payment, release and refund is public on the QIE explorer.',
    },
  ];

  return (
    <section id="trust" className="mx-auto max-w-6xl px-4 py-28">
      <Reveal className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <h2 className="max-w-[14ch] font-display text-5xl leading-[0.9] font-extrabold uppercase sm:text-6xl">
          Why you can trust it.
        </h2>
        {fee && config && (
          <p className="font-display text-2xl font-bold uppercase">
            Fee <span className="text-brand">{fee}%</span>
            {config.pricing.freeOrdersPerWallet > 0 && (
              <span className="ml-3 bg-brand px-2 py-0.5 align-middle text-sm text-brand-ink">
                First {config.pricing.freeOrdersPerWallet} orders free
              </span>
            )}
          </p>
        )}
      </Reveal>

      <div className="mt-12 grid border-t-2 border-rule sm:grid-cols-2">
        {POINTS.map((point, i) => (
          <Reveal
            key={point.title}
            delay={i * 0.05}
            className={`dashed-b py-7 sm:px-6 ${i % 2 === 0 ? 'sm:border-r sm:border-dashed sm:border-muted sm:pl-0' : ''}`}
          >
            <p className="font-mono text-xs text-brand">0{i + 1}</p>
            <h3 className="mt-2 font-display text-2xl font-bold uppercase">{point.title}</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">{point.text}</p>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold">
        <TrustLink href="/powered-by-qie">Contracts and addresses</TrustLink>
        <TrustLink href="/stats">Live stats</TrustLink>
        <TrustLink href={REPO_URL} external>
          Source code
        </TrustLink>
      </Reveal>
    </section>
  );
}

function TrustLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: string;
}) {
  const className =
    'inline-flex items-center gap-1 underline decoration-brand decoration-2 underline-offset-[6px] hover:text-brand';
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children} <ArrowUpRight className="size-4" aria-hidden />
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
