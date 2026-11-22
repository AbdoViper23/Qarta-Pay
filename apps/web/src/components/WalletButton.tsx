'use client';

import { ChevronDown, LogOut, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from 'wagmi';
import { appChain } from '@/lib/chains';
import { friendlyError } from '@/lib/errors';
import { shortAddress } from '@/lib/format';
import { useQieName } from '@/lib/hooks';
import { QIE_WALLET_RDNS } from '@/lib/wagmi';
import { Button } from './ui';

/** Wallet chip: `.qie` name when there is one, else the short address. QIE Wallet listed first. */
export function WalletButton() {
  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const { mutateAsync: connect, isPending } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { data: qieName } = useQieName(address);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isConnected && address) {
    if (chainId !== appChain.id) {
      return (
        <Button
          onClick={() =>
            switchChain({ chainId: appChain.id }).catch((e) => setError(friendlyError(e)))
          }
        >
          Switch to {appChain.name}
        </Button>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          title={`${address} (click to copy)`}
          onClick={() => void navigator.clipboard?.writeText(address)}
          className="flex min-h-11 max-w-44 items-center gap-2 rounded-full border border-line bg-surface-2 px-3 text-sm font-medium transition-colors hover:border-brand/60"
        >
          <span className="size-2 shrink-0 rounded-full bg-ok" aria-hidden />
          <span className={`truncate ${qieName ? '' : 'font-mono'}`}>
            {qieName ?? shortAddress(address)}
          </span>
        </button>
        <Button
          variant="ghost"
          onClick={() => disconnect({})}
          aria-label="Disconnect wallet"
          title="Disconnect"
          className="px-2"
        >
          <LogOut className="size-4" aria-hidden />
        </Button>
      </div>
    );
  }

  // De-duplicate: the explicit QIE Wallet connector and its EIP-6963 announcement are the same wallet.
  const announcedQie = connectors.some((c) => c.id === QIE_WALLET_RDNS);
  const options = connectors
    .filter((c) => !(c.id === 'qieWallet' && announcedQie))
    .filter((c) => c.id !== 'injected' || connectors.length === 2)
    .sort((a, b) => rank(a.id) - rank(b.id));

  return (
    <div className="relative">
      <Button onClick={() => setOpen(!open)} disabled={isPending} aria-expanded={open}>
        <Wallet className="size-4" aria-hidden />
        {isPending ? 'Connecting…' : 'Connect'}
        <ChevronDown className="hidden size-4 sm:block" aria-hidden />
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-line bg-surface-2 p-2 shadow-2xl shadow-black/40">
          {options.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface"
              onClick={async () => {
                setError(null);
                try {
                  await connect({ connector, chainId: appChain.id });
                  setOpen(false);
                } catch (e) {
                  setError(friendlyError(e));
                }
              }}
            >
              {connector.icon && <img src={connector.icon} alt="" className="size-6" />}
              <span className="font-medium">{label(connector.id, connector.name)}</span>
            </button>
          ))}
          <p className="px-3 py-2 text-xs text-muted">
            On a phone, open this site in your wallet app&apos;s browser.
          </p>
          {error && <p className="px-3 pb-2 text-sm text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}

function rank(id: string): number {
  if (id === QIE_WALLET_RDNS || id === 'qieWallet') return 0;
  if (id === 'io.metamask') return 1;
  return 2;
}

function label(id: string, name: string): string {
  if (id === 'injected') return 'Browser wallet';
  return name;
}
