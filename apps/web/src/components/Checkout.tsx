'use client';

import { erc20Abi } from 'viem';
import { qartaCheckoutAbi } from '@qarta/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  useBalance,
  useConnection,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import { api, type PayToken, type QuoteRequest, type QuoteResponse } from '@/lib/api';
import { appChain } from '@/lib/chains';
import { friendlyError } from '@/lib/errors';
import { trimDecimals } from '@/lib/format';
import { useAppConfig, useFreeOrders, usePrices } from '@/lib/hooks';
import { FreeOrdersCard } from './FreeOrders';
import { GetQusdcLink } from './GetQusdcLink';
import { Button, Card, Chip, Notice } from './ui';

type Draft = QuoteRequest extends infer R
  ? R extends unknown
    ? Omit<R, 'payer' | 'payToken'>
    : never
  : never;

/**
 * Price → (approve) → pay. One primary button whose label follows the step.
 * The signed quote is shown with a countdown; at zero the button becomes "Refresh price".
 */
export function Checkout({ draft, summary }: { draft: Draft | null; summary: string | null }) {
  const router = useRouter();
  const { address, isConnected, chainId } = useConnection();
  const publicClient = usePublicClient();
  const { mutateAsync: writeContract } = useWriteContract();
  const { data: prices } = usePrices();
  const { data: config } = useAppConfig();
  const { data: freeOrders } = useFreeOrders(address);
  const [payToken, setPayToken] = useState<PayToken>('QUSDC');
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  const qieDisabled = prices ? !prices.qieQuotesEnabled : false;
  const native = quote?.quote.token === '0x0000000000000000000000000000000000000000';
  const secondsLeft = quote
    ? Math.max(0, Math.floor((new Date(quote.expiresAt).getTime() - now) / 1000))
    : 0;
  const expired = Boolean(quote) && secondsLeft === 0;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: quote && !native ? quote.quote.token : undefined,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && quote ? [address, quote.checkout] : undefined,
    query: { enabled: Boolean(quote && !native && address) },
  });
  const { data: tokenBalance } = useReadContract({
    address: quote && !native ? quote.quote.token : undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(quote && !native && address) },
  });
  const { data: nativeBalance } = useBalance({ address, query: { enabled: Boolean(address) } });

  // A changed form invalidates the price.
  const draftKey = JSON.stringify(draft);
  useEffect(() => {
    setQuote(null);
    setError(null);
  }, [draftKey, payToken]);
  useEffect(() => {
    if (qieDisabled && payToken === 'QIE') setPayToken('QUSDC');
  }, [qieDisabled, payToken]);

  const amount = quote ? BigInt(quote.quote.amount) : 0n;
  const needsApproval = Boolean(quote && !native && (allowance ?? 0n) < amount);
  const shortOfQusdc = Boolean(
    quote && !native && tokenBalance !== undefined && tokenBalance < amount,
  );
  const shortOfQie = Boolean(quote && native && nativeBalance && nativeBalance.value < amount);

  async function getPrice() {
    if (!draft || !address) return;
    setError(null);
    setBusy('Getting a price…');
    try {
      setQuote(await api.quote({ ...draft, payer: address, payToken } as QuoteRequest));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!quote || !publicClient) return;
    setError(null);
    setBusy('Approve in your wallet…');
    try {
      const hash = await writeContract({
        address: quote.quote.token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [quote.checkout, amount],
        chainId: appChain.id,
      });
      setBusy('Waiting for the approval to confirm…');
      await publicClient.waitForTransactionReceipt({ hash });
      await refetchAllowance();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    if (!quote || !publicClient) return;
    setError(null);
    setBusy('Confirm the payment in your wallet…');
    try {
      const { quote: q } = quote;
      const hash = await writeContract({
        address: quote.checkout,
        abi: qartaCheckoutAbi,
        functionName: 'pay',
        args: [
          {
            orderId: q.orderId,
            payer: q.payer,
            token: q.token,
            amount: BigInt(q.amount),
            usdAmount: BigInt(q.usdAmount),
            expiry: BigInt(q.expiry),
          },
          quote.signature,
        ],
        value: native ? amount : 0n,
        chainId: appChain.id,
      });
      // Go to the order page at once; it follows the payment and the delivery.
      router.push(`/orders/${q.orderId}?tx=${hash}`);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(null);
    }
  }

  if (!isConnected) return <Notice>Connect your wallet to see the price.</Notice>;
  if (chainId !== appChain.id)
    return <Notice>Switch your wallet to {appChain.name} (button at the top).</Notice>;

  let action: { label: string; onClick: () => void; disabled?: boolean };
  if (!quote) action = { label: 'Get price', onClick: getPrice, disabled: !draft };
  else if (expired) action = { label: 'Refresh price', onClick: getPrice };
  else if (needsApproval)
    action = { label: 'Approve QUSDC', onClick: approve, disabled: shortOfQusdc };
  else
    action = {
      label: `Pay ${trimDecimals(quote.display.payAmount, 4)} ${quote.display.payToken}`,
      onClick: pay,
      disabled: shortOfQusdc || shortOfQie,
    };

  return (
    <Card className="space-y-4">
      {freeOrders && freeOrders.total > 0 && freeOrders.left > 0 && (
        <FreeOrdersCard
          left={freeOrders.left}
          total={freeOrders.total}
          maxUsd={freeOrders.maxUsd}
          costPercent={freeOrders.costPercent}
          thisOrderFree={Boolean(quote?.display.freeOrder)}
        />
      )}
      <div>
        <p className="mb-2 text-sm font-medium text-muted">Pay with</p>
        <div className="flex gap-2">
          <Chip selected={payToken === 'QUSDC'} onClick={() => setPayToken('QUSDC')}>
            QUSDC
          </Chip>
          <Chip
            selected={payToken === 'QIE'}
            onClick={() => setPayToken('QIE')}
            disabled={qieDisabled}
          >
            QIE
          </Chip>
        </div>
        {qieDisabled && (
          <p className="mt-2 text-sm text-muted">
            QIE price check unavailable right now — pay with QUSDC.
          </p>
        )}
      </div>

      {quote && (
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted">Product</dt>
          <dd className="text-right font-medium">{quote.display.productName}</dd>
          <dt className="text-muted">They get</dt>
          <dd className="text-right font-medium">
            {quote.display.faceValue} {quote.display.faceCurrency}
          </dd>
          {quote.display.recipient && (
            <>
              <dt className="text-muted">To</dt>
              <dd className="truncate text-right font-medium">{quote.display.recipient}</dd>
            </>
          )}
          <dt className="text-muted">Product cost</dt>
          <dd className="text-right font-mono tabular-nums">${quote.display.productUsd}</dd>
          <dt className="text-muted">
            Qarta fee (
            {quote.display.freeOrder ? config?.pricing.feePercent : quote.display.feePercent}
            %)
          </dt>
          {quote.display.freeOrder ? (
            <>
              <dd className="text-right">
                <span className="mr-2 font-mono text-muted tabular-nums line-through">
                  ${quote.display.waivedFeeUsd}
                </span>
                <span className="bg-ok px-1.5 py-0.5 text-xs font-bold text-surface uppercase">
                  Free
                </span>
              </dd>
              {quote.display.feeUsd !== '0' && (
                <>
                  <dt className="text-muted">Payment costs ({quote.display.feePercent}%)</dt>
                  <dd className="text-right font-mono tabular-nums">${quote.display.feeUsd}</dd>
                  <dd className="col-span-2 text-xs text-muted">
                    Passed on at cost: what it costs us to turn your payment into the delivery. We
                    make nothing on this order.
                  </dd>
                </>
              )}
            </>
          ) : (
            <dd className="text-right font-mono tabular-nums">${quote.display.feeUsd}</dd>
          )}
          <dt className="border-t-2 border-ink pt-2 font-semibold">You pay</dt>
          <dd className="border-t-2 border-ink pt-2 text-right text-lg font-bold">
            ${quote.display.usd}
            <span className="block text-sm font-normal text-muted">
              {trimDecimals(quote.display.payAmount, 6)} {quote.display.payToken}
            </span>
          </dd>
          {quote.display.qiePriceUsd && (
            <dd className="col-span-2 text-xs text-muted">
              QIE at ${trimDecimals(quote.display.qiePriceUsd, 4)}, the lower of the QIE oracle and
              QIEDex prices, plus {quote.display.qieBufferPercent}% in case the price moves while
              you pay.
            </dd>
          )}
          {!quote.display.freeOrder && quote.display.freeOrdersLeft > 0 && freeOrders && (
            <dd className="col-span-2 text-xs text-muted">
              Free orders cover products up to ${freeOrders.maxUsd}, so this one has the normal fee.
              You still have {quote.display.freeOrdersLeft} free{' '}
              {quote.display.freeOrdersLeft === 1 ? 'order' : 'orders'} for a smaller amount.
            </dd>
          )}
          <dd className="col-span-2 text-xs text-muted">
            No other fees. The QIE network fee for the payment is a fraction of a cent.
          </dd>
          <dt className="text-muted">Price valid for</dt>
          <dd className="text-right font-medium">{expired ? 'expired' : `${secondsLeft}s`}</dd>
        </dl>
      )}

      {summary && !quote && <p className="text-sm text-muted">{summary}</p>}
      {shortOfQusdc && (
        <Notice tone="error">
          Not enough QUSDC in your wallet. <GetQusdcLink />
        </Notice>
      )}
      {shortOfQie && <Notice tone="error">Not enough QIE in your wallet.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <Button
        className="w-full text-lg"
        onClick={action.onClick}
        disabled={Boolean(busy) || action.disabled}
      >
        {busy ?? action.label}
      </Button>
      <p className="text-xs text-muted">
        Your payment is held by the Qarta Pay escrow contract until delivery. If delivery fails, it
        is refunded to your wallet automatically.
      </p>
    </Card>
  );
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
