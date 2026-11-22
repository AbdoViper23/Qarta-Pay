/** Where top-ups work today: a quiet, static line instead of a ticker. */
const COUNTRIES = ['Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Philippines', 'India', 'Egypt'];

export function Marquee() {
  return (
    <section aria-label="Countries" className="border-y border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-baseline sm:gap-10">
        <p className="shrink-0 text-sm text-muted">Mobile top-ups in</p>
        <ul className="flex flex-wrap gap-x-7 gap-y-2 font-display text-xl text-ink/85">
          {COUNTRIES.map((country) => (
            <li key={country}>{country}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
