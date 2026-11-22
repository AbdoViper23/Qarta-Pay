import Link from 'next/link';
import { Reveal } from './Reveal';

/** The QIE pieces behind every order, as a plain editorial list. */
const ROWS = [
  [
    'QartaCheckout escrow',
    'Holds every payment on QIE Mainnet until delivery. Refunds keep working even when sales are paused.',
  ],
  ['QIE Wallet', 'Connect in one tap. It is listed first.'],
  ['QIE and QUSDC', 'Pay with the native coin or the stablecoin.'],
  ['QIE oracle', 'Every QIE payment is checked on-chain against the QIE/USD price feed.'],
  ['QIEDEX', 'Prices use the lower of oracle and pool, and pause if the two disagree.'],
  ['QIE ID', 'Your .qie name instead of a hex address.'],
] as const;

export function Integrations() {
  return (
    <section id="built-on-qie" className="mx-auto max-w-6xl px-4 py-28">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <h2 className="font-display text-4xl leading-tight font-light tracking-tight text-balance sm:text-5xl">
            Built on QIE, end to end.
          </h2>
          <p className="mt-5 max-w-sm text-muted">
            Every payment, release and refund is a transaction anyone can check on the QIE explorer.
          </p>
          <Link
            href="/powered-by-qie"
            className="mt-6 inline-block text-sm text-ink underline decoration-line underline-offset-[6px] transition-colors hover:decoration-ink"
          >
            Contracts and addresses
          </Link>
        </Reveal>
        <dl className="border-t border-line">
          {ROWS.map(([name, text], i) => (
            <Reveal key={name} delay={i * 0.04}>
              <div className="grid gap-1 border-b border-line py-6 sm:grid-cols-[13rem_1fr] sm:gap-8">
                <dt className="font-display text-xl">{name}</dt>
                <dd className="text-muted">{text}</dd>
              </div>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
