'use client';

import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import { api } from './api';

export function useAppConfig() {
  return useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: 5 * 60_000 });
}

export function usePrices() {
  return useQuery({ queryKey: ['prices'], queryFn: api.prices, refetchInterval: 15_000 });
}

/** The wallet's `.qie` name, or null. Display only. */
export function useQieName(wallet: Address | undefined) {
  return useQuery({
    queryKey: ['identity', wallet],
    queryFn: () => api.identity(wallet!),
    enabled: Boolean(wallet),
    staleTime: 60 * 60_000,
    select: (data) => data.qieName,
  });
}

/** How many fee-free orders this wallet has left; refetched whenever a page mounts. */
export function useFreeOrders(wallet: Address | undefined) {
  return useQuery({
    queryKey: ['free-orders', wallet?.toLowerCase()],
    queryFn: () => api.freeOrders(wallet!),
    enabled: Boolean(wallet),
  });
}
