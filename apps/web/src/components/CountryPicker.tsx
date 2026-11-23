'use client';

import { Check, ChevronDown, Globe, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { countryName } from '@/lib/format';

/** Pseudo-country for gift cards that work anywhere. */
export const GLOBAL = 'GLOBAL';

function Flag({ code }: { code: string }) {
  if (code === GLOBAL) return <Globe aria-hidden className="size-5 shrink-0 text-brand" />;
  return (
    // Flags come from Reloadly's public flag bucket (the same URL its /countries returns).
    <img
      src={`https://s3.amazonaws.com/rld-flags/${code.toLowerCase()}.svg`}
      alt=""
      loading="lazy"
      className="h-4 w-6 shrink-0 border border-ink/20 object-cover"
    />
  );
}

function label(code: string): string {
  return code === GLOBAL ? 'Global (works anywhere)' : countryName(code);
}

/**
 * Searchable country dropdown: a button that opens a filter box and a list. Type a name or
 * an ISO code; arrows move, Enter picks, Escape closes.
 */
export function CountryPicker({
  id,
  countries,
  value,
  onChange,
  pinned = [],
}: {
  id: string;
  countries: string[];
  value: string;
  onChange: (code: string) => void;
  /** Shown first, above the alphabetical list (e.g. GLOBAL). */
  pinned?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...pinned, ...countries.filter((code) => !pinned.includes(code))];
    if (!q) return all;
    return all.filter((code) => label(code).toLowerCase().includes(q) || code.toLowerCase() === q);
  }, [countries, pinned, query]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onOutside = (event: MouseEvent) => {
      if (root.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery('');
      setActive(0);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // The filter is cleared on close, so the list opens fresh even when typing starts at once.
  const close = () => {
    setOpen(false);
    setQuery('');
    setActive(0);
  };
  const pick = (code: string) => {
    onChange(code);
    close();
  };

  return (
    <div ref={root} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={countries.length === 0 && pinned.length === 0}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex min-h-12 w-full items-center gap-3 border-2 border-ink bg-surface px-4 py-2 text-left text-base text-ink outline-none focus-visible:border-brand disabled:text-muted"
      >
        {value ? <Flag code={value} /> : null}
        <span className="flex-1 truncate">{value ? label(value) : 'Loading countries…'}</span>
        <ChevronDown
          aria-hidden
          className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 border-2 border-ink bg-surface shadow-[6px_6px_0_var(--color-ink)]">
          <div className="dashed-b flex items-center gap-2 px-3">
            <Search aria-hidden className="size-4 shrink-0 text-muted" />
            <input
              ref={input}
              role="combobox"
              aria-controls={listId}
              aria-expanded
              aria-activedescendant={options[active] ? `${listId}-${options[active]}` : undefined}
              aria-label="Search countries"
              placeholder={`Search ${countries.length} countries`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, options.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (options[active]) pick(options[active]);
                } else if (e.key === 'Escape') {
                  close();
                }
              }}
              className="min-h-11 w-full bg-transparent text-base outline-none placeholder:text-muted/70"
            />
          </div>
          <ul ref={list} id={listId} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {options.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted">No country matches “{query}”.</li>
            )}
            {options.map((code, i) => (
              <li
                key={code}
                id={`${listId}-${code}`}
                role="option"
                aria-selected={code === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(code)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm ${
                  i === active ? 'bg-ink text-surface' : ''
                } ${pinned.includes(code) && i === pinned.length - 1 && !query ? 'dashed-b' : ''}`}
              >
                <Flag code={code} />
                <span className="flex-1 truncate">{label(code)}</span>
                {code !== GLOBAL && (
                  <span className={`text-xs ${i === active ? 'text-surface/70' : 'text-muted'}`}>
                    {code}
                  </span>
                )}
                {code === value && <Check aria-hidden className="size-4 shrink-0" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
