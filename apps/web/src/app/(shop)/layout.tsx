import type { ReactNode } from 'react';

/** Store pages: one readable column under the floating header. */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-28 pb-20 [&_h1]:font-display [&_h1]:text-4xl [&_h1]:font-normal [&_h1]:tracking-tight sm:[&_h1]:text-5xl">
      {children}
    </div>
  );
}
