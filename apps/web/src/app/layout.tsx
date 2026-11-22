import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { Providers } from '@/components/Providers';
import { WalletButton } from '@/components/WalletButton';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});
const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Qarta Pay — spend crypto on real life',
  description:
    'Spend QIE and QUSDC on mobile airtime and gift cards. Paid on QIE Mainnet, held in escrow until delivery.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#05070d',
};

const nav = [
  { href: '/airtime', label: 'Top up' },
  { href: '/giftcards', label: 'Gift cards' },
  { href: '/history', label: 'My orders' },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`}>
      <body className="min-h-dvh overflow-x-hidden">
        <Providers>
          <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-bg/60 py-2 pr-2 pl-4 shadow-[0_8px_32px_-12px_rgb(0_0_0/0.6)] backdrop-blur-xl">
              <Link href="/" aria-label="Qarta Pay home" className="flex items-center gap-2">
                <Logo className="size-7" />
                <span className="text-base font-semibold tracking-tight">
                  Qarta <span className="text-brand">Pay</span>
                </span>
              </Link>
              <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-ink"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <WalletButton />
            </div>
          </header>
          <main>{children}</main>
          <footer className="border-t border-line">
            <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 text-sm text-muted sm:grid-cols-[1.5fr_1fr_1fr]">
              <div className="space-y-3">
                <Link href="/" className="flex items-center gap-2 text-ink">
                  <Logo className="size-6" />
                  <span className="font-semibold">Qarta Pay</span>
                </Link>
                <p className="max-w-xs">
                  Spend QIE and QUSDC on airtime and gift cards. Every payment is held in an
                  on-chain escrow until delivery.
                </p>
              </div>
              <FooterColumn
                title="Shop"
                links={[...nav, { href: '/about', label: 'How it works' }]}
              />
              <FooterColumn
                title="Transparency"
                links={[
                  { href: '/powered-by-qie', label: 'Powered by QIE' },
                  { href: '/stats', label: 'Live stats' },
                ]}
              />
            </div>
            <p className="mx-auto max-w-5xl px-4 pb-8 text-xs text-muted/80">
              Payments settle on QIE Mainnet. Deliveries through Reloadly, a third-party provider.
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <p className="mb-3 font-mono text-xs tracking-widest text-ink/70 uppercase">{title}</p>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="transition-colors hover:text-ink">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
