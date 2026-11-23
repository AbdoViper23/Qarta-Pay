import { describe, expect, it } from 'vitest';
import { FakeSupplier } from '../supplier/fake';
import type { Supplier } from '../supplier/types';
import { Catalog, loadCatalogConfig } from './catalog';

const base = {
  airtimeCountries: 'all',
  giftCardCountries: 'all',
  blockedCountries: ['IR'],
  giftCardBrands: [],
  giftCardProductIds: [],
};

/** A fake whose country lists we control, counting supplier calls. */
function supplierWith(countries: string[] | Error) {
  const fake = new FakeSupplier();
  let calls = 0;
  const supplier = Object.assign(Object.create(fake) as Supplier, {
    listCountries: async () => {
      calls += 1;
      if (countries instanceof Error) throw countries;
      return countries;
    },
  });
  return { supplier, calls: () => calls };
}

describe('catalog countries', () => {
  it('"all" offers every supplier country, sorted, minus blocked ones', async () => {
    const { supplier, calls } = supplierWith(['NG', 'IR', 'EG', 'NG']);
    const catalog = new Catalog(supplier, loadCatalogConfig(base));
    expect(await catalog.airtimeCountries()).toEqual(['EG', 'NG']);
    expect(await catalog.isAirtimeCountry('IR')).toBe(false);
    expect(await catalog.isAirtimeCountry('EG')).toBe(true);
    expect(calls()).toBe(1); // cached
  });

  it('an explicit list does not ask the supplier', async () => {
    const { supplier, calls } = supplierWith(['NG']);
    const catalog = new Catalog(
      supplier,
      loadCatalogConfig({ ...base, giftCardCountries: ['US', 'IR'] }),
    );
    expect(await catalog.giftCardCountries()).toEqual(['US']);
    expect(calls()).toBe(0);
  });

  it('a supplier failure is not cached', async () => {
    const failing = supplierWith(new Error('down'));
    const catalog = new Catalog(failing.supplier, loadCatalogConfig(base));
    await expect(catalog.airtimeCountries()).rejects.toThrow('down');
    await expect(catalog.airtimeCountries()).rejects.toThrow('down');
    expect(failing.calls()).toBe(2);
  });

  it('rejects lower-case or malformed country codes in config', () => {
    expect(() => loadCatalogConfig({ ...base, airtimeCountries: ['ng'] })).toThrow();
    expect(() => loadCatalogConfig({ ...base, airtimeCountries: 'some' })).toThrow();
  });

  it('the shipped catalog offers every country except sanctioned ones', () => {
    const shipped = loadCatalogConfig();
    expect(shipped.airtimeCountries).toBe('all');
    expect(shipped.giftCardCountries).toBe('all');
    expect(shipped.blockedCountries).toEqual(expect.arrayContaining(['CU', 'IR', 'KP', 'SY']));
  });
});

describe('gift card brands', () => {
  it('an empty brand list sells every USD fixed-price product', async () => {
    const fake = new FakeSupplier();
    const all = await new Catalog(fake, loadCatalogConfig(base)).giftCards('US');
    const listed = await fake.listGiftCards('US');
    const sellable = listed.filter((p) => p.senderCurrency === 'USD' && p.denominations.length);
    expect(all.length).toBe(sellable.length);
  });
});
