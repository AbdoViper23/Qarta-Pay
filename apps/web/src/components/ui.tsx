import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>
      {children}
    </section>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  const styles = {
    primary: 'bg-ink text-bg hover:bg-white',
    secondary: 'border border-line text-ink hover:border-ink/40',
    ghost: 'text-muted hover:text-ink',
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2 text-[15px] font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
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
    info: 'border-line bg-surface-2 text-ink',
    error: 'border-danger/30 bg-danger-soft text-danger',
    ok: 'border-ok/30 bg-ok-soft text-ok',
  }[tone];
  const Icon = { info: Info, error: CircleAlert, ok: CircleCheck }[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-muted">
      {children}
    </label>
  );
}

export const inputClass =
  'min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-2 text-base text-ink placeholder:text-muted/70 outline-none transition-colors duration-200 focus:border-ink/50';

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
      className={`min-h-11 rounded-full border px-4 py-2 font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? 'border-ink bg-ink text-bg' : 'border-line text-ink hover:border-ink/40'
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
      className="text-brand underline decoration-brand/40 underline-offset-4 transition-colors hover:decoration-brand"
    >
      {children}
    </a>
  );
}

/** Small pill used for trust facts and statuses. */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'ok';
}) {
  const styles = {
    neutral: 'border-line bg-surface-2 text-muted',
    brand: 'border-brand/30 bg-brand-soft text-brand',
    ok: 'border-ok/30 bg-ok-soft text-ok',
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${styles}`}
    >
      {children}
    </span>
  );
}
