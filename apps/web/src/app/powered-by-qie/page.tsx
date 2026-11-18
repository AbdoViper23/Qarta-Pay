'use client';

import { useConnection } from 'wagmi';
import { GetQusdcLink } from '@/components/GetQusdcLink';
import { Card, ExternalLink } from '@/components/ui';
import { addressLink } from '@/lib/chains';
import { useAppConfig, usePrices, useQieName } from '@/lib/hooks';

/**
 * One card per QIE component (docs/06-FRONTEND.md). Addresses come from /v1/config, prices from
 * /v1/prices. Keep in sync with the README "QIE integrations" table.
 */
export default function PoweredByQiePage() {
  const { data: config } = useAppConfig();
  const { data: prices } = usePrices();
  const { address, connector } = useConnection();
  const { data: qieName } = useQieName(address);
  const c = config?.contracts;

  const Addr = ({ label, value }: { label: string; value: string | null | undefined }) =>
    value ? (
      <p className="truncate text-sm">
        <span className="text-muted">{label}: </span>
        <ExternalLink href={addressLink(value)}>{value}</ExternalLink>
      </p>
    ) : null;

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-extrabold">Powered by QIE</h1>
      <p className="text-muted">Every part of a Qarta Pay order runs on QIE technology.</p>

      <Card className="space-y-2">
        <h2 className="text-lg font-bold">QIE Mainnet — escrow contract</h2>
        <p className="text-sm">
          Your payment is held by the QartaCheckout contract until delivery; failed deliveries are
          refunded on-chain.
        </p>
        <Addr label="QartaCheckout" value={c?.checkout} />
      </Card>

      <Card className="space-y-2">
        <h2 className="text-lg font-bold">QIE Wallet</h2>
        <p className="text-sm">Connect with QIE Wallet — it is listed first.</p>
        <p className="text-sm text-muted">Connected: {connector?.name ?? 'no wallet'}</p>
      </Card>

      <Card className="space-y-2">
        <h2 className="text-lg font-bold">QIE and QUSDC</h2>
        <p className="text-sm">
          Pay with QIE, the chain&apos;s own coin, or QUSDC, QIE&apos;s stablecoin.
        </p>
        <Addr label="QUSDC" value={c?.qusdc} />
        <GetQusdcLink />
      </Card>

      <Card className="space-y-2">
        <h2 className="text-lg font-bold">QIE ID</h2>
        <p className="text-sm">We show your .qie name instead of a hex address.</p>
        <p className="text-sm text-muted">
          Your name: {qieName ?? (address ? 'none yet — ' : 'connect a wallet')}
          {address && !qieName && (
            <ExternalLink href="https://id.qie.digital/">get one at id.qie.digital</ExternalLink>
          )}
        </p>
        <Addr label="Reverse resolver" value={c?.qieReverseResolver} />
      </Card>

      <Card className="space-y-2">
        <h2 className="text-lg font-bold">QIE Oracle</h2>
        <p className="text-sm">
          Every native-QIE payment is checked on-chain against this QIE/USD price feed.
        </p>
        <p className="text-sm">
          QIE/USD: <strong>{prices?.oracle ? `$${prices.oracle.priceUsd}` : '—'}</strong>
          {prices?.oracle && (
            <span className="text-muted">
              {' '}
              · updated {Math.round(prices.oracle.ageSeconds / 60)} min ago
            </span>
          )}
        </p>
        <Addr label="Price feed" value={c?.qieUsdFeed} />
      </Card>

      <Card className="space-y-2">
        <h2 className="text-lg font-bold">QIEDEX</h2>
        <p className="text-sm">
          QIE prices use the lower of the oracle and the QIEDex pool, and QIE payments pause if the
          two disagree too much. Treasury revenue is converted to QUSDC here.
        </p>
        <p className="text-sm">
          Pool price: <strong>{prices?.pool ? `$${prices.pool.priceUsd}` : '—'}</strong>
          {prices?.deviationBps && (
            <span className="text-muted">
              {' '}
              · {(Number(prices.deviationBps) / 100).toFixed(2)}% from the oracle
            </span>
          )}
          {prices && !prices.qieQuotesEnabled && (
            <span className="text-danger"> · QIE payments paused</span>
          )}
        </p>
        <Addr label="WQIE/QUSDC pair" value={c?.qiedexPair} />
        <GetQusdcLink />
      </Card>

      <Card className="space-y-2">
        <h2 className="text-lg font-bold">QIE Pass</h2>
        <p className="text-sm text-muted">
          Coming soon: cashback and higher limits for verified users.
        </p>
      </Card>
    </div>
  );
}
