/**
 * Qarta Pay mark: a coin inside a rounded card that unrolls into a receipt strip, reading as
 * a Q. Crypto in, something real out. Master files and rules: public/brand, docs/16-BRAND.md.
 * Follows the theme through --color-brand. Decorative; the caller labels it.
 */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="28 28 200 200" className={className} aria-hidden focusable="false">
      <path
        fill="var(--color-brand)"
        d="M68 28H188A40 40 0 0 1 228 68V146H166.37A58 58 0 1 0 118 172H228V188A40 40 0 0 1 188 228H68A40 40 0 0 1 28 188V68A40 40 0 0 1 68 28ZM88 114a30 30 0 1 0 60 0a30 30 0 1 0 -60 0Z"
      />
    </svg>
  );
}
