/** Short form of an address for display, for example `0x3F43…5DA5`. */
export function shortAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('not an address');
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Trims a decimal string to `digits` decimals for display (never used for amounts we sign). */
export function trimDecimals(value: string, digits: number): string {
  const [whole, fraction = ''] = value.split('.');
  const kept = fraction.slice(0, digits).replace(/0+$/, '');
  return kept ? `${whole}.${kept}` : (whole ?? '0');
}

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
