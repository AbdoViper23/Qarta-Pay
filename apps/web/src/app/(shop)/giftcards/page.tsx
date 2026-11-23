'use client';

import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Checkout } from '@/components/Checkout';
import { CountryPicker, GLOBAL } from '@/components/CountryPicker';
import { Card, Chip, Label, Notice, inputClass } from '@/components/ui';
import { api, type GiftCardProduct } from '@/lib/api';
import { byCountryName, countryName, preferredCountry } from '@/lib/format';
import { useAppConfig } from '@/lib/hooks';

function matches(product: GiftCardProduct, q: string): boolean {
  return `${product.name} ${product.brandName}`.toLowerCase().includes(q);
}

/** Waits until typing pauses before passing the value on. */
function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export default function GiftCardsPage() {
  const { data: config } = useAppConfig();
  const countries = useMemo(() => byCountryName(config?.giftCardCountries ?? []), [config]);
  const [country, setCountry] = useState('');
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState<GiftCardProduct | null>(null);
  const [value, setValue] = useState('');
  const q = query.trim().toLowerCase();
  const searchTerm = useDebounced(q, 400);

  useEffect(() => {
    const preferred = preferredCountry(countries);
    if (!country && preferred) setCountry(preferred);
  }, [country, countries]);
  useEffect(() => {
    setProduct(null);
    setValue('');
  }, [country]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['giftcards', country],
    queryFn: () => api.giftCards(country),
    enabled: Boolean(country),
  });
  // Worldwide cards are shown next to the country's own, so "Razer" finds both.
  const { data: global } = useQuery({
    queryKey: ['giftcards', GLOBAL],
    queryFn: () => api.giftCards(GLOBAL),
    enabled: Boolean(country) && country !== GLOBAL,
  });
  const { data: elsewhere, isFetching: searching } = useQuery({
    queryKey: ['giftcards-search', searchTerm],
    queryFn: () => api.searchGiftCards(searchTerm),
    enabled: searchTerm.length >= 2,
  });

  const here = useMemo(
    () => (data?.products ?? []).filter((item) => !q || matches(item, q)),
    [data, q],
  );
  const worldwide = useMemo(() => {
    if (country === GLOBAL) return [];
    const shown = new Set(here.map((item) => item.productId));
    return (global?.products ?? []).filter(
      (item) => !shown.has(item.productId) && (!q || matches(item, q)),
    );
  }, [global, here, country, q]);
  const otherCountries = useMemo(() => {
    if (searchTerm.length < 2 || q.length < 2) return [];
    const shown = new Set([...here, ...worldwide].map((item) => item.productId));
    return (elsewhere?.products ?? []).filter((item) => !shown.has(item.productId));
  }, [elsewhere, here, worldwide, searchTerm, q]);

  const choose = (item: GiftCardProduct) => {
    setProduct(item);
    setValue('');
  };

  // The order names the product's own country: for worldwide cards and results from other
  // countries it differs from the picker.
  const draft =
    product && value
      ? {
          kind: 'GIFT_CARD' as const,
          countryCode: product.countryCode,
          productId: product.productId,
          unitPrice: value,
        }
      : null;

  const nothing =
    data && here.length === 0 && worldwide.length === 0 && otherCountries.length === 0;

  return (
    <div className="space-y-5 pt-2">
      <h1 className="text-2xl font-extrabold">Buy a gift card</h1>
      <Card className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="country">Card country</Label>
            <CountryPicker
              id="country"
              countries={countries}
              pinned={countries.length ? [GLOBAL] : []}
              value={country}
              onChange={setCountry}
            />
          </div>
          <div>
            <Label htmlFor="brand-search">Search brands</Label>
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted"
              />
              <input
                id="brand-search"
                type="search"
                autoComplete="off"
                placeholder="Steam, Amazon, PlayStation…"
                className={`${inputClass} pr-11 pl-11 [&::-webkit-search-cancel-button]:hidden`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                  className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-muted hover:text-ink"
                >
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {isLoading && <p className="text-sm text-muted">Loading brands…</p>}
        {isError && <Notice tone="error">Cannot load gift cards right now.</Notice>}
        {nothing && !searching && (
          <Notice>
            {q
              ? `No card matches “${query.trim()}”.`
              : 'No gift cards available for this country yet. Try Global.'}
          </Notice>
        )}

        <ProductGroup
          title={country === GLOBAL ? 'Works anywhere' : country ? countryName(country) : ''}
          items={here}
          selected={product}
          onChoose={choose}
        />
        <ProductGroup
          title="Global · works anywhere"
          items={worldwide}
          selected={product}
          onChoose={choose}
        />
        <ProductGroup
          title="In other countries"
          note="Cards for another country's store. Check they work where you will redeem them."
          items={otherCountries}
          selected={product}
          onChoose={choose}
          showCountry
        />
        {searching && <p className="text-sm text-muted">Searching every country…</p>}

        {product && (
          <div className="dashed-t pt-4">
            <Label>Value · {product.name}</Label>
            <div className="flex flex-wrap gap-2">
              {product.denominations.map((d) => (
                <Chip
                  key={d.recipient}
                  selected={value === d.recipient}
                  onClick={() => setValue(d.recipient)}
                >
                  {d.recipient} {product.recipientCurrency}
                </Chip>
              ))}
            </div>
            {product.redeemInstructions && (
              <p className="mt-2 text-sm text-muted">{product.redeemInstructions}</p>
            )}
          </div>
        )}
      </Card>
      <Checkout
        draft={draft}
        summary={product ? 'Choose a value.' : 'Choose a brand to continue.'}
      />
      <p className="text-xs text-muted">
        Brand names belong to their owners. Qarta Pay is not affiliated with them; cards are
        supplied by Reloadly.
      </p>
    </div>
  );
}

function ProductGroup({
  title,
  note,
  items,
  selected,
  onChoose,
  showCountry = false,
}: {
  title: string;
  note?: string;
  items: GiftCardProduct[];
  selected: GiftCardProduct | null;
  onChoose: (item: GiftCardProduct) => void;
  showCountry?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-bold uppercase">{title}</h2>
        <span className="text-xs text-muted">{items.length}</span>
      </div>
      {note && <p className="-mt-2 text-xs text-muted">{note}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => {
          const isSelected = selected?.productId === item.productId;
          return (
            <button
              key={item.productId}
              type="button"
              onClick={() => onChoose(item)}
              aria-pressed={isSelected}
              className={`flex min-h-24 flex-col items-center justify-center gap-2 border-2 p-3 text-center text-sm font-semibold ${
                isSelected
                  ? 'border-ink bg-surface shadow-[4px_4px_0_var(--color-shadow)]'
                  : 'border-ink/20 bg-surface hover:border-ink'
              }`}
            >
              {item.logoUrl && (
                <img src={item.logoUrl} alt="" loading="lazy" className="h-8 object-contain" />
              )}
              <span className="line-clamp-2">{item.name}</span>
              {showCountry && (
                <span className="text-[11px] font-normal text-muted uppercase">
                  {countryName(item.countryCode)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
