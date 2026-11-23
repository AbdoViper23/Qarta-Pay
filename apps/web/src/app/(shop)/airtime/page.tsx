'use client';

import { useEffect, useMemo, useState } from 'react';
import { Checkout } from '@/components/Checkout';
import { Card, Chip, Label, Notice, inputClass } from '@/components/ui';
import { api, type Operator } from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { byCountryName, countryName, preferredCountry } from '@/lib/format';
import { useAppConfig } from '@/lib/hooks';

export default function AirtimePage() {
  const { data: config } = useAppConfig();
  const countries = useMemo(() => byCountryName(config?.airtimeCountries ?? []), [config]);
  const [country, setCountry] = useState('');
  const [phone, setPhone] = useState('');
  const [operator, setOperator] = useState<Operator | null>(null);
  const [formatted, setFormatted] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    const preferred = preferredCountry(countries);
    if (!country && preferred) setCountry(preferred);
  }, [country, countries]);

  // Detect the operator once the number looks complete (debounced).
  useEffect(() => {
    setOperator(null);
    setFormatted(null);
    setDetectError(null);
    setAmount('');
    if (!country || phone.replace(/\D/g, '').length < 7) return;
    const timer = setTimeout(async () => {
      setDetecting(true);
      try {
        const result = await api.detect(phone, country);
        if (!result.operator) setDetectError('We could not find the operator for this number.');
        setOperator(result.operator);
        setFormatted(result.phoneE164 ?? null);
      } catch (e) {
        setDetectError(friendlyError(e));
      } finally {
        setDetecting(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [country, phone]);

  const amountError = useMemo(() => {
    if (!operator || !amount || operator.denominationType !== 'RANGE') return null;
    const value = Number(amount);
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) return 'Use a number like 5 or 2.50.';
    if (operator.minAmount && value < Number(operator.minAmount))
      return `Minimum is $${operator.minAmount}.`;
    if (operator.maxAmount && value > Number(operator.maxAmount))
      return `Maximum is $${operator.maxAmount}.`;
    return null;
  }, [operator, amount]);

  const draft =
    operator && amount && !amountError
      ? {
          kind: 'AIRTIME' as const,
          countryCode: country,
          recipientPhone: phone,
          operatorId: operator.operatorId,
          amount,
        }
      : null;

  const local =
    operator?.fxRate && amount && !amountError
      ? `≈ ${(Number(amount) * operator.fxRate).toLocaleString('en', { maximumFractionDigits: 0 })} ${operator.destinationCurrency}`
      : null;

  return (
    <div className="space-y-5 pt-2">
      <h1 className="text-2xl font-extrabold">Top up a phone</h1>
      <Card className="space-y-4">
        <div>
          <Label htmlFor="country">Country</Label>
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
        <div>
          <Label htmlFor="phone">Phone number</Label>
          <input
            id="phone"
            inputMode="tel"
            autoComplete="tel"
            className={inputClass}
            placeholder="e.g. 0803 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {detecting && <p className="mt-1 text-sm text-muted">Finding the operator…</p>}
          {detectError && <p className="mt-1 text-sm text-danger">{detectError}</p>}
        </div>
        {operator && (
          <div className="space-y-3">
            <Notice>
              You are topping up <strong>{formatted ?? phone}</strong> — {operator.name}. A wrong
              number cannot be undone.
            </Notice>
            <div>
              <Label>Amount (USD)</Label>
              {operator.denominationType === 'FIXED' ? (
                <div className="flex flex-wrap gap-2">
                  {operator.fixedAmounts.map((value) => (
                    <Chip key={value} selected={amount === value} onClick={() => setAmount(value)}>
                      ${value}
                    </Chip>
                  ))}
                </div>
              ) : (
                <input
                  inputMode="decimal"
                  className={inputClass}
                  placeholder={`${operator.minAmount ?? ''} – ${operator.maxAmount ?? ''}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.trim())}
                />
              )}
              {amountError && <p className="mt-1 text-sm text-danger">{amountError}</p>}
              {local && (
                <p className="mt-1 text-sm text-muted">They receive {local} (operator rate).</p>
              )}
            </div>
          </div>
        )}
      </Card>
      <Checkout draft={draft} summary={operator ? null : 'Enter a phone number to continue.'} />
    </div>
  );
}
