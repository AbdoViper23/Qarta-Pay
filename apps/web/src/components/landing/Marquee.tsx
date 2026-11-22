/** Where top-ups work today, printed like a line item. */
const COUNTRIES = ['Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Philippines', 'India', 'Egypt'];

export function Marquee() {
  return (
    <section aria-label="Countries" className="border-y-2 border-rule bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 sm:flex-row sm:items-baseline sm:gap-10">
        <p className="shrink-0 text-xs font-semibold uppercase">Mobile top-ups in</p>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 font-display text-2xl font-bold uppercase">
          {COUNTRIES.map((country) => (
            <li key={country}>{country}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
