'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useConnection } from 'wagmi';
import { Button, Card, Notice } from '@/components/ui';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { shortAddress } from '@/lib/format';
import { useQieName } from '@/lib/hooks';
import { useSignIn } from '@/lib/siwe';

export default function HistoryPage() {
  const { address } = useConnection();
  const { data: qieName } = useQieName(address);
  const { token, signIn } = useSignIn();
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['history', token],
    queryFn: () => api.orders(token!),
    enabled: Boolean(token),
  });

  if (!address) return <Notice>Connect your wallet to see your orders.</Notice>;

  return (
    <div className="space-y-5 pt-2">
      <h1 className="text-2xl font-extrabold">Orders of {qieName ?? shortAddress(address)}</h1>
      {!token && (
        <Card className="space-y-3">
          <p className="text-sm text-muted">
            Sign a free message with your wallet to see your orders.
          </p>
          <Button onClick={() => signIn().catch((e) => setError(friendlyError(e)))}>Sign in</Button>
        </Card>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {isLoading && <p className="text-muted">Loading…</p>}
      {data && data.orders.length === 0 && <Notice>No orders yet.</Notice>}
      <ul className="space-y-3">
        {data?.orders.map((order) => (
          <li key={order.id}>
            <Link href={`/orders/${order.id}`}>
              <Card className="flex items-center justify-between gap-3 hover:border-brand">
                <div>
                  <p className="font-semibold">{order.productName}</p>
                  <p className="text-sm text-muted">{new Date(order.createdAt).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">${order.usdAmount}</p>
                  <p className="text-xs text-muted">
                    {order.status.replace('_', ' ').toLowerCase()}
                  </p>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
