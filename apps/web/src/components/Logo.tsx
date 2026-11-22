/** Qarta Pay mark: a card outline with a brass edge. Decorative; the caller labels it. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <rect
        x="3"
        y="7"
        width="26"
        height="18"
        rx="4"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="1.6"
      />
      <path d="M3 12.5h26" stroke="var(--color-ink)" strokeWidth="1.6" />
      <rect x="7" y="17" width="7" height="4" rx="1" fill="var(--color-brand)" />
    </svg>
  );
}
