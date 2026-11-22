/** Qarta Pay mark: a card with a check, in the brand amber. Decorative; the caller labels it. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <rect x="2" y="6" width="28" height="20" rx="5" fill="var(--color-brand)" />
      <rect x="2" y="11" width="28" height="3.5" fill="var(--color-brand-ink)" opacity="0.25" />
      <path
        d="M10 19.5l3.2 3.2L22 14"
        fill="none"
        stroke="var(--color-brand-ink)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
