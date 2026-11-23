import { z } from 'zod';
import catalogJson from '../../config/catalog.json' with { type: 'json' };
import type { GiftCardProduct, Operator, Supplier } from '../supplier/types';

const iso2 = z.string().regex(/^[A-Z]{2}$/);
/** "all" = every country the supplier lists for the product. */
const countries = z.union([z.literal('all'), z.array(iso2)]);

const catalogSchema = z.object({
  airtimeCountries: countries,
  giftCardCountries: countries,
  /** Never offered, even when the supplier lists them. */
  blockedCountries: z.array(iso2).default([]),
  /** Empty = every brand. */
  giftCardBrands: z.array(z.string().min(1)),
  giftCardProductIds: z.array(z.number().int()),
});
export type CatalogConfig = z.infer<typeof catalogSchema>;

/** `config/catalog.json`, imported (not read from disk) so a bundled function carries it. */
export function loadCatalogConfig(raw: unknown = catalogJson): CatalogConfig {
  return catalogSchema.parse(raw);
}

/**
 * What we sell: the supplier's catalog, narrowed to the configured countries and brands
 * (minus blocked countries), and only products we know how to price (sender currency USD,
 * fixed denominations). Supplier responses are cached for 10 minutes; failures are not cached.
 */
export class Catalog {
  private readonly cache = new Map<string, { at: number; value: unknown }>();

  constructor(
    private readonly supplier: Supplier,
    readonly config: CatalogConfig,
    private readonly ttlMs = 10 * 60_000,
  ) {}

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value as T;
    const value = await load();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  private async countries(product: 'airtime' | 'giftcards'): Promise<string[]> {
    const configured =
      product === 'airtime' ? this.config.airtimeCountries : this.config.giftCardCountries;
    const codes =
      configured === 'all'
        ? await this.cached(`countries:${product}`, () => this.supplier.listCountries(product))
        : configured;
    const blocked = new Set(this.config.blockedCountries);
    return [...new Set(codes)].filter((code) => !blocked.has(code)).sort();
  }

  airtimeCountries(): Promise<string[]> {
    return this.countries('airtime');
  }

  giftCardCountries(): Promise<string[]> {
    return this.countries('giftcards');
  }

  async isAirtimeCountry(countryCode: string): Promise<boolean> {
    return (await this.airtimeCountries()).includes(countryCode);
  }

  async detectOperator(phone: string, countryCode: string): Promise<Operator | null> {
    if (!(await this.isAirtimeCountry(countryCode))) return null;
    return this.cached(`detect:${countryCode}:${phone}`, () =>
      this.supplier.detectOperator(phone, countryCode),
    );
  }

  async operator(operatorId: number): Promise<Operator> {
    return this.cached(`operator:${operatorId}`, () => this.supplier.getOperator(operatorId));
  }

  async giftCards(countryCode: string): Promise<GiftCardProduct[]> {
    if (!(await this.giftCardCountries()).includes(countryCode)) return [];
    const products = await this.cached(`giftcards:${countryCode}`, () =>
      this.supplier.listGiftCards(countryCode),
    );
    return products.filter((product) => this.isSellable(product));
  }

  /**
   * Worldwide cards, one per product line: Reloadly lists e.g. "Razer Gold Global AF",
   * "... AL", ... once per country, so the copy for the US (else the first) is kept.
   */
  async globalGiftCards(): Promise<GiftCardProduct[]> {
    const found = await this.cached('giftcards:global', () =>
      this.supplier.searchGiftCards('global'),
    );
    const allowed = new Set(await this.giftCardCountries());
    const lines = new Map<string, GiftCardProduct>();
    for (const product of found) {
      if (!product.global || !allowed.has(product.countryCode) || !this.isSellable(product))
        continue;
      // "Razer Gold (Global) US" and "Razer Gold Global AF" are the same line.
      const line = product.name
        .replace(/\s+[A-Z]{2,3}$/, '')
        .replace(/[()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const kept = lines.get(line);
      if (!kept || (product.countryCode === 'US' && kept.countryCode !== 'US'))
        lines.set(line, product);
    }
    return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Sellable products in any served country whose name contains `query`; at most 60. */
  async searchGiftCards(query: string): Promise<GiftCardProduct[]> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const found = await this.cached(`giftcards:search:${q}`, () =>
      this.supplier.searchGiftCards(q),
    );
    const allowed = new Set(await this.giftCardCountries());
    return found
      .filter((product) => allowed.has(product.countryCode) && this.isSellable(product))
      .slice(0, 60);
  }

  async giftCard(productId: number, countryCode: string): Promise<GiftCardProduct | null> {
    return (
      (await this.giftCards(countryCode)).find((product) => product.productId === productId) ?? null
    );
  }

  private isSellable(product: GiftCardProduct): boolean {
    if (product.senderCurrency !== 'USD' || product.denominations.length === 0) return false;
    if (this.config.giftCardProductIds.includes(product.productId)) return true;
    if (this.config.giftCardBrands.length === 0) return true;
    const brand = product.brandName.toLowerCase();
    return this.config.giftCardBrands.some((allowed) => brand.includes(allowed.toLowerCase()));
  }
}
