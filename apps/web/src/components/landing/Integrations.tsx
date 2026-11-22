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
          <h2 className="font-display text-5xl leading-[0.9] font-extrabold uppercase sm:text-6xl">
            Built on QIE, end to end.
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-7 text-muted">
            Every payment, release and refund is a transaction anyone can check on the QIE explorer.
          </p>
          <Link
            href="/powered-by-qie"
            className="mt-6 inline-block text-sm font-semibold underline decoration-brand decoration-2 underline-offset-[6px] hover:text-brand"
          >
            Contracts and addresses
          </Link>
        </Reveal>
        <dl className="border-t-2 border-rule">
          {ROWS.map(([name, text], i) => (
            <Reveal key={name} delay={i * 0.04}>
              <div className="dashed-b grid gap-1 py-5 sm:grid-cols-[14rem_1fr] sm:gap-8">
                <dt className="font-display text-2xl font-bold uppercase">{name}</dt>
                <dd className="text-sm leading-6 text-muted">{text}</dd>
              </div>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
