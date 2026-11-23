import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, IBM_Plex_Mono } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { Providers } from '@/components/Providers';
import { ThemeToggle, themeScript } from '@/components/ThemeToggle';
import { WalletButton } from '@/components/WalletButton';
import './globals.css';

const barlow = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-barlow',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
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
  themeColor: '#ecebe6',
};

const nav = [
  { href: '/airtime', label: 'Top up' },
  { href: '/giftcards', label: 'Gift cards' },
  { href: '/history', label: 'My orders' },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the theme script sets data-theme before React hydrates.
    <html lang="en" className={`${barlow.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="grain min-h-dvh overflow-x-hidden">
        <Providers>
          <header className="fixed inset-x-0 top-0 z-40 border-b-2 border-rule bg-bg/95 backdrop-blur-sm">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
              <Link href="/" aria-label="Qarta Pay home" className="flex items-center gap-2.5">
                <Logo className="size-6" />
                <span className="font-display text-2xl font-extrabold tracking-wide whitespace-nowrap uppercase">
                  Qarta Pay
                </span>
              </Link>
              <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="text-[13px] text-ink underline-offset-4 transition-colors hover:underline"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <WalletButton />
              </div>
            </div>
          </header>
          <main>{children}</main>
          <footer className="border-t-2 border-rule">
            <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm text-muted sm:grid-cols-[1.5fr_1fr_1fr]">
              <div className="space-y-3">
                <Link href="/" className="flex items-center gap-2 text-ink">
                  <Logo className="size-6" />
                  <span className="font-display text-xl font-extrabold tracking-wide uppercase">
                    Qarta Pay
                  </span>
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
            <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted/80">
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
      <p className="mb-3 font-display text-lg font-bold tracking-wide uppercase">{title}</p>
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
