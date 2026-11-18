import Link from 'next/link';
import { Card } from '@/components/ui';

export default function AboutPage() {
  return (
    <div className="space-y-5 pt-2">
      <h1 className="text-2xl font-extrabold">How Qarta Pay works</h1>
      <Card className="space-y-3">
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <strong>You get a price.</strong> It is signed by Qarta Pay and valid for a short time
            (90 seconds in QIE, 10 minutes in QUSDC).
          </li>
          <li>
            <strong>You pay the escrow contract</strong> on QIE Mainnet. Nobody — not even Qarta Pay
            — can take that money anywhere except to the shop after delivery, or back to you.
          </li>
          <li>
            <strong>We deliver</strong> through our supplier Reloadly. When the top-up or gift card
            is delivered, the payment is released to the shop. If it fails, the contract refunds you
            automatically.
          </li>
        </ol>
        <p className="text-sm text-muted">
          Safety net: if an order is neither delivered nor refunded within 2 hours, you can take
          your payment back yourself with one click on the order page.
        </p>
        <p className="text-sm text-muted">
          What you trust us for: to deliver before releasing your payment. Every step is public on
          the QIE explorer.
        </p>
        <Link href="/powered-by-qie" className="font-semibold text-brand">
          See the QIE technology behind it →
        </Link>
      </Card>
    </div>
  );
}
