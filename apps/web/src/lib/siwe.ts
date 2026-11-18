'use client';

import { useCallback, useState } from 'react';
import { createSiweMessage } from 'viem/siwe';
import { useConnection, useSignMessage } from 'wagmi';
import { api } from './api';
import { appChain } from './chains';

const KEY = 'qarta.session';

function readStored(address: string | undefined): string | null {
  if (!address) return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { address: string; token: string; expiresAt: string };
    if (stored.address.toLowerCase() !== address.toLowerCase()) return null;
    if (new Date(stored.expiresAt).getTime() < Date.now() + 30_000) return null;
    return stored.token;
  } catch {
    return null;
  }
}

/**
 * Sign-In with Ethereum: one wallet signature gives a 30-minute session, used to reveal
 * gift card codes and show order history. The token stays in this tab only (sessionStorage).
 */
export function useSignIn() {
  const { address } = useConnection();
  const { mutateAsync: signMessage } = useSignMessage();
  const [token, setToken] = useState<string | null>(null);
  const current = token ?? readStored(address);

  const signIn = useCallback(async (): Promise<string> => {
    const existing = readStored(address);
    if (existing) return existing;
    if (!address) throw new Error('connect a wallet first');
    const { nonce } = await api.nonce();
    const message = createSiweMessage({
      domain: window.location.host,
      address,
      uri: window.location.origin,
      version: '1',
      chainId: appChain.id,
      nonce,
      statement:
        'Sign in to Qarta Pay to see your orders and gift card codes. This does not cost anything.',
      expirationTime: new Date(Date.now() + 10 * 60_000),
    });
    const signature = await signMessage({ message });
    const session = await api.verify(message, signature);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(session));
    } catch {
      // private mode: keep it in memory only
    }
    setToken(session.token);
    return session.token;
  }, [address, signMessage]);

  return { token: current, signIn };
}
