/** Public settings, inlined at build time. Each must be referenced literally for Next.js. */
export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '1983'),
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || undefined,
  qiedexSwapUrl: process.env.NEXT_PUBLIC_QIEDEX_SWAP_URL ?? 'https://www.swap.dex.qie.digital/swap',
};
