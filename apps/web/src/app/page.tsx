import Link from 'next/link';
import { Balances } from '@/components/Balances';
import { Card } from '@/components/ui';

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="space-y-2 pt-4">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Your crypto, as good as cash.
        </h1>
        <p className="text-muted">
          Top up any phone or buy a gift card with QIE or QUSDC. Your payment waits in an escrow
          contract until delivery — if it fails, it comes back to your wallet.
        </p>
        <Balances />
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/airtime" className="block">
          <Card className="h-full transition hover:border-brand">
            <p className="text-2xl" aria-hidden>
              📱
            </p>
            <h2 className="mt-2 text-xl font-bold">Top up a phone</h2>
            <p className="text-sm text-muted">
              Airtime for your number or your family&apos;s, delivered in seconds.
            </p>
          </Card>
        </Link>
        <Link href="/giftcards" className="block">
          <Card className="h-full transition hover:border-brand">
            <p className="text-2xl" aria-hidden>
              🎁
            </p>
            <h2 className="mt-2 text-xl font-bold">Buy a gift card</h2>
            <p className="text-sm text-muted">
              Popular brands. The code appears right here after payment.
            </p>
          </Card>
        </Link>
      </div>
      <Card>
        <h2 className="font-bold">How your money is protected</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>You pay into the Qarta Pay escrow contract on QIE Mainnet.</li>
          <li>We deliver the top-up or gift card, then release the payment.</li>
          <li>
            If delivery fails, the contract refunds you. If we do nothing for 2 hours, you can take
            it back yourself.
          </li>
        </ol>
        <Link href="/about" className="mt-3 inline-block text-sm font-semibold text-brand">
          How it works →
        </Link>
      </Card>
    </div>
  );
}
