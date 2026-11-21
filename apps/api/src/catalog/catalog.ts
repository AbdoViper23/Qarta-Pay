import { z } from 'zod';
import catalogJson from '../../config/catalog.json' with { type: 'json' };
import type { GiftCardProduct, Operator, Supplier } from '../supplier/types';

const catalogSchema = z.object({
  airtimeCountries: z.array(z.string().length(2)),
  giftCardCountries: z.array(z.string().length(2)),
  giftCardBrands: z.array(z.string().min(1)),
  giftCardProductIds: z.array(z.number().int()),
});
export type CatalogConfig = z.infer<typeof catalogSchema>;

/** `config/catalog.json`, imported (not read from disk) so a bundled function carries it. */
export function loadCatalogConfig(raw: unknown = catalogJson): CatalogConfig {
  return catalogSchema.parse(raw);
}

/**
 * What we sell: the supplier's catalog, narrowed to the curated countries and brands, and
 * only products we know how to price (sender currency USD, fixed denominations).
 * Supplier responses are cached for 10 minutes.
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

  isAirtimeCountry(countryCode: string): boolean {
    return this.config.airtimeCountries.includes(countryCode);
  }

  async detectOperator(phone: string, countryCode: string): Promise<Operator | null> {
    if (!this.isAirtimeCountry(countryCode)) return null;
    return this.cached(`detect:${countryCode}:${phone}`, () =>
      this.supplier.detectOperator(phone, countryCode),
    );
  }

  async operator(operatorId: number): Promise<Operator> {
    return this.cached(`operator:${operatorId}`, () => this.supplier.getOperator(operatorId));
  }

  async giftCards(countryCode: string): Promise<GiftCardProduct[]> {
    if (!this.config.giftCardCountries.includes(countryCode)) return [];
    const products = await this.cached(`giftcards:${countryCode}`, () =>
      this.supplier.listGiftCards(countryCode),
    );
    return products.filter((product) => this.isSellable(product));
  }

  async giftCard(productId: number, countryCode: string): Promise<GiftCardProduct | null> {
    return (
      (await this.giftCards(countryCode)).find((product) => product.productId === productId) ?? null
    );
  }

  private isSellable(product: GiftCardProduct): boolean {
    if (product.senderCurrency !== 'USD' || product.denominations.length === 0) return false;
    if (this.config.giftCardProductIds.includes(product.productId)) return true;
    const brand = product.brandName.toLowerCase();
    return this.config.giftCardBrands.some((allowed) => brand.includes(allowed.toLowerCase()));
  }
}
