import { ArrowRight, Gift, RotateCcw, ShieldCheck, Smartphone, Zap } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Balances } from '@/components/Balances';
import { Badge, Card } from '@/components/ui';

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-4 pt-2">
        <Badge tone="brand">
          <ShieldCheck className="size-3.5" aria-hidden />
          Escrow-protected on QIE Mainnet
        </Badge>
        <h1 className="text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
          Your crypto, <span className="text-brand">as good as cash.</span>
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Top up any phone or buy a gift card with QIE or QUSDC. Your payment waits in an escrow
          contract until delivery. If delivery fails, it comes back to your wallet.
        </p>
        <Balances />
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <ProductCard
          href="/airtime"
          icon={<Smartphone className="size-6" aria-hidden />}
          title="Top up a phone"
          text="Airtime for your number or your family's, delivered in seconds."
        />
        <ProductCard
          href="/giftcards"
          icon={<Gift className="size-6" aria-hidden />}
          title="Buy a gift card"
          text="Popular brands. The code appears right here after payment."
        />
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        <Fact icon={<ShieldCheck className="size-5" aria-hidden />} title="Held in escrow">
          Funds stay in the contract until delivery.
        </Fact>
        <Fact icon={<RotateCcw className="size-5" aria-hidden />} title="Automatic refunds">
          Failed delivery returns your payment.
        </Fact>
        <Fact icon={<Zap className="size-5" aria-hidden />} title="Fast">
          Most orders complete in under a minute.
        </Fact>
      </ul>

      <Card>
        <h2 className="text-lg font-semibold">How your money is protected</h2>
        <ol className="mt-4 space-y-4">
          {[
            'You pay into the Qarta Pay escrow contract on QIE Mainnet.',
            'We deliver the top-up or gift card, then release the payment.',
            'If delivery fails, the contract refunds you. If we do nothing for 2 hours, you can take it back yourself.',
          ].map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-brand/40 bg-brand-soft font-mono text-sm text-brand">
                {i + 1}
              </span>
              <span className="pt-0.5 text-sm text-muted">{step}</span>
            </li>
          ))}
        </ol>
        <Link
          href="/about"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-brand-hover"
        >
          How it works <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Card>
    </div>
  );
}

function ProductCard({
  href,
  icon,
  title,
  text,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Link href={href} className="group block rounded-2xl">
      <Card className="h-full transition-colors duration-200 group-hover:border-brand/60">
        <div className="flex size-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
          {icon}
        </div>
        <h2 className="mt-4 flex items-center gap-2 text-xl font-semibold">
          {title}
          <ArrowRight
            className="size-5 text-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-brand"
            aria-hidden
          />
        </h2>
        <p className="mt-1 text-sm text-muted">{text}</p>
      </Card>
    </Link>
  );
}

function Fact({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl border border-line/60 bg-surface/50 p-4">
      <span className="text-accent">{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-sm text-muted">{children}</span>
      </span>
    </li>
  );
}
