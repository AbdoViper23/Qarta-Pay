'use client';

import { qartaCheckoutAbi } from '@qarta/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useConnection, usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import { Button, Card, ExternalLink, Notice } from '@/components/ui';
import { api, type OrderStatus } from '@/lib/api';
import { appChain, txLink } from '@/lib/chains';
import { friendlyError } from '@/lib/errors';
import { trimDecimals } from '@/lib/format';
import { useAppConfig } from '@/lib/hooks';
import { useSignIn } from '@/lib/siwe';

const FINAL: OrderStatus[] = ['SETTLED', 'REFUNDED', 'EXPIRED', 'NEEDS_REVIEW'];

const STEPS = [
  { label: 'Paid', reached: ['PAID', 'FULFILLING', 'DELIVERED', 'SETTLED'] },
  { label: 'Delivering', reached: ['FULFILLING', 'DELIVERED', 'SETTLED'] },
  { label: 'Delivered', reached: ['DELIVERED', 'SETTLED'] },
] as const;

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const payTx = useSearchParams().get('tx');
  const { data: config } = useAppConfig();
  const { address } = useConnection();
  const publicClient = usePublicClient();
  const { mutateAsync: writeContract } = useWriteContract();
  const { token, signIn } = useSignIn();
  const [codes, setCodes] = useState<{ code: string; pin: string | null }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: order, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.order(id),
    refetchInterval: (query) =>
      query.state.data && FINAL.includes(query.state.data.status) ? false : 2000,
  });
  const { data: refundTimeout } = useReadContract({
    address: config?.contracts.checkout,
    abi: qartaCheckoutAbi,
    functionName: 'refundTimeout',
    query: { enabled: Boolean(config) },
  });

  if (isError) return <Notice tone="error">We could not find this order.</Notice>;
  if (!order) return <p className="pt-6 text-muted">Loading your order…</p>;

  const claimableAt =
    order.paidAt && refundTimeout !== undefined
      ? new Date(order.paidAt).getTime() + Number(refundTimeout) * 1000
      : null;
  const canClaim =
    ['PAID', 'FULFILLING', 'NEEDS_REVIEW', 'REFUND_PENDING'].includes(order.status) &&
    address?.toLowerCase() === order.payer &&
    claimableAt !== null &&
    Date.now() >= claimableAt;

  async function reveal() {
    setError(null);
    setBusy(true);
    try {
      const session = token ?? (await signIn());
      setCodes((await api.code(id, session)).codes);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function claimRefund() {
    if (!config || !publicClient) return;
    setError(null);
    setBusy(true);
    try {
      const hash = await writeContract({
        address: config.contracts.checkout,
        abi: qartaCheckoutAbi,
        functionName: 'claimRefund',
        args: [order!.id],
        chainId: appChain.id,
      });
      await publicClient.waitForTransactionReceipt({ hash });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 pt-2">
      <h1 className="text-2xl font-extrabold">{order.productName}</h1>
      <Card className="space-y-4">
        <StatusLine status={order.status} refundedByPayer={order.refundedByPayer} />
        {!['REFUNDED', 'EXPIRED', 'QUOTED', 'REFUND_PENDING'].includes(order.status) && (
          <ol className="grid grid-cols-3 gap-2 text-center text-sm">
            {STEPS.map((step) => {
              const done = (step.reached as readonly string[]).includes(order.status);
              return (
                <li
                  key={step.label}
                  className={`rounded-xl px-2 py-3 font-semibold ${done ? 'bg-brand text-brand-ink' : 'bg-brand-soft text-muted'}`}
                >
                  {step.label}
                </li>
              );
            })}
          </ol>
        )}
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted">To</dt>
          <dd className="truncate text-right">{order.recipient}</dd>
          <dt className="text-muted">They get</dt>
          <dd className="text-right">
            {order.faceValue} {order.faceCurrency}
          </dd>
          <dt className="text-muted">You paid</dt>
          <dd className="text-right">
            ${order.usdAmount} ({trimDecimals(order.payAmount, 6)} {order.payToken})
          </dd>
        </dl>
        <ul className="space-y-1 text-sm">
          {(order.paidTxHash ?? payTx) && (
            <li>
              Payment:{' '}
              <ExternalLink href={txLink((order.paidTxHash ?? payTx)!)}>
                view on explorer
              </ExternalLink>
            </li>
          )}
          {order.settleTxHash && (
            <li>
              Settlement:{' '}
              <ExternalLink href={txLink(order.settleTxHash)}>view on explorer</ExternalLink>
            </li>
          )}
          {order.refundTxHash && (
            <li>
              Refund:{' '}
              <ExternalLink href={txLink(order.refundTxHash)}>view on explorer</ExternalLink>
            </li>
          )}
        </ul>
      </Card>

      {order.kind === 'GIFT_CARD' && order.hasCode && (
        <Card className="space-y-3">
          <h2 className="font-bold">Your gift card</h2>
          {codes ? (
            codes.map((c) => (
              <div key={c.code} className="space-y-2 rounded-xl bg-brand-soft p-4">
                <p className="font-mono text-lg break-all">{c.code}</p>
                {c.pin && <p className="font-mono">PIN: {c.pin}</p>}
                <Button
                  variant="secondary"
                  onClick={() => void navigator.clipboard?.writeText(c.code)}
                >
                  Copy code
                </Button>
              </div>
            ))
          ) : (
            <>
              <p className="text-sm text-muted">
                Sign a free message with your wallet to show the code.
              </p>
              <Button onClick={reveal} disabled={busy}>
                {busy ? 'Waiting for your wallet…' : 'Reveal code'}
              </Button>
            </>
          )}
        </Card>
      )}

      {canClaim && (
        <Card className="space-y-3">
          <p className="text-sm">
            This order was not completed in time. You can take your payment back from the escrow
            contract now.
          </p>
          <Button onClick={claimRefund} disabled={busy}>
            {busy ? 'Confirm in your wallet…' : 'Claim refund'}
          </Button>
        </Card>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

function StatusLine({
  status,
  refundedByPayer,
}: {
  status: OrderStatus;
  refundedByPayer: boolean;
}) {
  const text: Record<OrderStatus, string> = {
    QUOTED: 'Waiting for your payment to confirm on QIE…',
    EXPIRED: 'This price expired before it was paid. Nothing was charged.',
    PAID: 'Payment received. Starting delivery…',
    FULFILLING: 'Delivering… most deliveries take seconds, some operators take a few minutes.',
    DELIVERED: 'Delivered!',
    SETTLED: 'Delivered!',
    REFUND_PENDING: 'Delivery failed. Refunding your payment…',
    REFUNDED: refundedByPayer
      ? 'You took your payment back from the escrow.'
      : 'Delivery failed. Your payment was refunded to your wallet.',
    NEEDS_REVIEW: 'We are checking this order by hand. Your payment stays safe in escrow.',
  };
  const tone =
    status === 'SETTLED' || status === 'DELIVERED'
      ? 'ok'
      : status === 'NEEDS_REVIEW'
        ? 'error'
        : 'info';
  return <Notice tone={tone}>{text[status]}</Notice>;
}
