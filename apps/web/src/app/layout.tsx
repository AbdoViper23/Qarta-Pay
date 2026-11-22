import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import { WalletButton } from '@/components/WalletButton';
import { Logo } from '@/components/Logo';
import './globals.css';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Qarta Pay',
  description:
    'Spend QIE and QUSDC on mobile airtime and gift cards. Paid on QIE Mainnet, held in escrow until delivery.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b1120',
};

const nav = [
  { href: '/airtime', label: 'Top up' },
  { href: '/giftcards', label: 'Gift cards' },
  { href: '/history', label: 'My orders' },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh">
        <Providers>
          <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/80 backdrop-blur-md">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
              <Link href="/" aria-label="Qarta Pay home" className="flex items-center gap-2">
                <Logo className="size-8" />
                <span className="text-lg font-bold tracking-tight">
                  Qarta <span className="text-brand">Pay</span>
                </span>
              </Link>
              <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <WalletButton />
            </div>
          </header>
          <main className="mx-auto max-w-3xl px-4 pt-6 pb-16">{children}</main>
          <footer className="border-t border-line/60">
            <div className="mx-auto max-w-3xl space-y-3 px-4 py-8 text-sm text-muted">
              <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="transition-colors hover:text-ink"
                  >
                    {item.label}
                  </Link>
                ))}
                <Link href="/about" className="transition-colors hover:text-ink">
                  How it works
                </Link>
                <Link href="/powered-by-qie" className="transition-colors hover:text-ink">
                  Powered by QIE
                </Link>
                <Link href="/stats" className="transition-colors hover:text-ink">
                  Stats
                </Link>
              </nav>
              <p className="text-xs">
                Payments settle on QIE Mainnet. Deliveries through Reloadly, a third-party provider.
              </p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
