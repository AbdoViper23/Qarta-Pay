/** Short form of an address for display, for example `0x3F43…5DA5`. */
export function shortAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('not an address');
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
