import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 shadow-sm ${className}`}>
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
    primary: 'bg-brand text-brand-ink hover:opacity-90',
    secondary: 'border border-line bg-surface text-ink hover:bg-brand-soft',
    ghost: 'text-brand hover:underline',
  }[variant];
  return (
    <button
      {...props}
      className={`min-h-11 rounded-xl px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
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
    info: 'bg-brand-soft text-ink',
    error: 'bg-danger-soft text-danger',
    ok: 'bg-brand-soft text-ok',
  }[tone];
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl px-4 py-3 text-sm ${styles}`}
    >
      {children}
    </p>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-muted">
      {children}
    </label>
  );
}

export const inputClass =
  'min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none focus:border-brand';

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
      className={`min-h-11 rounded-xl border px-4 py-2 font-medium ${
        selected
          ? 'border-brand bg-brand text-brand-ink'
          : 'border-line bg-surface text-ink hover:border-brand'
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
      className="text-brand underline underline-offset-2"
    >
      {children}
    </a>
  );
}
