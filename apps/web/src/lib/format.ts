import { getCountryCallingCode, getExampleNumber, type CountryCode } from 'libphonenumber-js';
import mobileExamples from 'libphonenumber-js/examples.mobile.json';
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

/** Country codes sorted by their English name, for a long dropdown. */
export function byCountryName(codes: string[]): string[] {
  return [...codes].sort((a, b) => countryName(a).localeCompare(countryName(b)));
}

/** The browser's own region when we serve it, else the first in the list. */
export function preferredCountry(codes: string[]): string | undefined {
  if (typeof navigator !== 'undefined') {
    for (const tag of navigator.languages ?? [navigator.language]) {
      try {
        const region = new Intl.Locale(tag).maximize().region;
        if (region && codes.includes(region)) return region;
      } catch {
        // ignore malformed language tags
      }
    }
  }
  return codes[0];
}

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Dialling code and a sample mobile number in national format, e.g. +20 and 0100 123 4567. */
export function phoneHint(country: string): { callingCode: string; example: string } | null {
  try {
    const code = country as CountryCode;
    const example = getExampleNumber(code, mobileExamples)?.formatNational();
    return example ? { callingCode: `+${getCountryCallingCode(code)}`, example } : null;
  } catch {
    return null; // a code libphonenumber does not know
  }
}
