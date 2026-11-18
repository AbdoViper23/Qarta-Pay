'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, ExternalLink, Notice } from '@/components/ui';
import { api } from '@/lib/api';
import { addressLink } from '@/lib/chains';

export default function StatsPage() {
  const { data, isError } = useQuery({
    queryKey: ['stats'],
    queryFn: api.stats,
    refetchInterval: 30_000,
  });
  if (isError) return <Notice tone="error">Stats are unavailable right now.</Notice>;
  const tiles: [string, string][] = data
    ? [
        ['Orders delivered', String(data.ordersSettled)],
        ['Volume', `$${data.volumeUsd}`],
        ['Paying wallets', String(data.uniquePayingWallets)],
        ['Repeat wallets', String(data.repeatWallets)],
        ['Active wallets (7 days)', String(data.activeWallets7d)],
        ['Refund rate', `${(data.refundRate * 100).toFixed(1)}%`],
        [
          'Median delivery',
          data.medianDeliverySeconds === null ? '—' : `${data.medianDeliverySeconds}s`,
        ],
      ]
    : [];
  return (
    <div className="space-y-5 pt-2">
      <h1 className="text-2xl font-extrabold">Qarta Pay in numbers</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <Card key={label}>
            <p className="text-sm text-muted">{label}</p>
            <p className="text-2xl font-extrabold">{value}</p>
          </Card>
        ))}
      </div>
      {data && (
        <p className="text-sm text-muted">
          Every order is an event of the escrow contract, so anyone can check these numbers:{' '}
          <ExternalLink href={addressLink(data.checkout)}>{data.checkout}</ExternalLink>
        </p>
      )}
    </div>
  );
}
