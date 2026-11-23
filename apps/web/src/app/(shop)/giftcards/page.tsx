'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Checkout } from '@/components/Checkout';
import { Card, Chip, Label, Notice, inputClass } from '@/components/ui';
import { api, type GiftCardProduct } from '@/lib/api';
import { byCountryName, countryName, preferredCountry } from '@/lib/format';
import { useAppConfig } from '@/lib/hooks';

export default function GiftCardsPage() {
  const { data: config } = useAppConfig();
  const countries = useMemo(() => byCountryName(config?.giftCardCountries ?? []), [config]);
  const [country, setCountry] = useState('');
  const [product, setProduct] = useState<GiftCardProduct | null>(null);
  const [value, setValue] = useState('');

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

  const draft =
    product && value
      ? {
          kind: 'GIFT_CARD' as const,
          countryCode: country,
          productId: product.productId,
          unitPrice: value,
        }
      : null;

  return (
    <div className="space-y-5 pt-2">
      <h1 className="text-2xl font-extrabold">Buy a gift card</h1>
      <Card className="space-y-4">
        <div>
          <Label htmlFor="country">Card country</Label>
          <select
            id="country"
            className={inputClass}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            {countries.map((code) => (
              <option key={code} value={code}>
                {countryName(code)}
              </option>
            ))}
          </select>
        </div>
        {isLoading && <p className="text-sm text-muted">Loading brands…</p>}
        {isError && <Notice tone="error">Cannot load gift cards right now.</Notice>}
        {data && data.products.length === 0 && (
          <Notice>No gift cards available for this country yet.</Notice>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {data?.products.map((item) => (
            <button
              key={item.productId}
              type="button"
              onClick={() => {
                setProduct(item);
                setValue('');
              }}
              aria-pressed={product?.productId === item.productId}
              className={`flex min-h-20 flex-col items-center justify-center gap-2 border-2 p-3 text-center text-sm font-semibold ${
                product?.productId === item.productId
                  ? 'border-ink bg-surface shadow-[4px_4px_0_var(--color-ink)]'
                  : 'border-ink/20 bg-surface hover:border-ink'
              }`}
            >
              {item.logoUrl && <img src={item.logoUrl} alt="" className="h-8 object-contain" />}
              {item.name}
            </button>
          ))}
        </div>
        {product && (
          <div>
            <Label>Value</Label>
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
