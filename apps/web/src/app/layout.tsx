import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import { WalletButton } from '@/components/WalletButton';
import './globals.css';

export const metadata: Metadata = {
  title: 'Qarta Pay',
  description:
    'Spend QIE and QUSDC on mobile airtime and gift cards. Paid on QIE Mainnet, held in escrow until delivery.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <Providers>
          <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
            <Link href="/" className="text-xl font-extrabold tracking-tight text-brand">
              Qarta Pay
            </Link>
            <WalletButton />
          </header>
          <main className="mx-auto max-w-3xl px-4 pb-16">{children}</main>
          <footer className="mx-auto flex max-w-3xl flex-wrap gap-x-5 gap-y-2 border-t border-line px-4 py-6 text-sm text-muted">
            <Link href="/history">My orders</Link>
            <Link href="/about">How it works</Link>
            <Link href="/powered-by-qie">Powered by QIE</Link>
            <Link href="/stats">Stats</Link>
            <span>Deliveries through Reloadly, a third-party provider.</span>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
