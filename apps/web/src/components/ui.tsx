import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** A receipt slip: white paper on the page, hairline ink border. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`border border-ink bg-surface p-5 ${className}`}>{children}</section>;
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  const styles = {
    primary: 'border-2 border-ink bg-ink text-surface hover:bg-[#2a2a2a]',
    secondary: 'border-2 border-ink text-ink hover:bg-surface',
    ghost: 'text-muted underline-offset-4 hover:text-ink hover:underline',
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 px-5 py-2 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    />
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'ok';
  children: ReactNode;
}) {
  const styles = {
    info: 'border-ink/40 bg-surface text-ink',
    error: 'border-danger bg-danger-soft text-danger',
    ok: 'border-ok bg-ok-soft text-ok',
  }[tone];
  const Icon = { info: Info, error: CircleAlert, ok: CircleCheck }[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 border px-4 py-3 text-sm ${styles}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-ink uppercase">
      {children}
    </label>
  );
}

export const inputClass =
  'min-h-12 w-full border-2 border-ink bg-surface px-4 py-2 text-base text-ink placeholder:text-muted/70 outline-none transition-colors duration-150 focus:border-brand';

export function Chip({
  selected,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      {...props}
      aria-pressed={selected}
      className={`min-h-11 border-2 px-4 py-2 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
        selected ? 'border-ink bg-ink text-surface' : 'border-ink/30 text-ink hover:border-ink'
      }`}
    >
      {children}
    </button>
  );
}

export function ExternalLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <span>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-ink underline decoration-brand decoration-2 underline-offset-4 hover:text-brand"
    >
      {children}
    </a>
  );
}

/** A small printed tag. `brand` is the stamp red. */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'ok';
}) {
  const styles = {
    neutral: 'border-ink/40 text-muted',
    brand: 'border-brand text-brand',
    ok: 'border-ok text-ok',
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-semibold uppercase ${styles}`}
    >
      {children}
    </span>
  );
}
