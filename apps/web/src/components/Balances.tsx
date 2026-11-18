'use client';

import { erc20Abi, formatUnits } from 'viem';
import { useBalance, useConnection, useReadContract } from 'wagmi';
import { trimDecimals } from '@/lib/format';
import { useAppConfig } from '@/lib/hooks';
import { GetQusdcLink } from './GetQusdcLink';

export function Balances() {
  const { address } = useConnection();
  const { data: config } = useAppConfig();
  const { data: qie } = useBalance({ address, query: { enabled: Boolean(address) } });
  const { data: qusdc } = useReadContract({
    address: config?.contracts.qusdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && config) },
  });
  if (!address) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <span>
        <span className="text-muted">QIE </span>
        <strong>{qie ? trimDecimals(formatUnits(qie.value, 18), 4) : '…'}</strong>
      </span>
      <span>
        <span className="text-muted">QUSDC </span>
        <strong>{qusdc !== undefined ? trimDecimals(formatUnits(qusdc, 6), 2) : '…'}</strong>
      </span>
      <GetQusdcLink label="Get QUSDC" />
    </div>
  );
}
