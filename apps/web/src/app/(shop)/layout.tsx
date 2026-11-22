import type { ReactNode } from 'react';

/** Store pages: one readable column under the floating header. */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-28 pb-20 [&_h1]:font-display [&_h1]:text-5xl [&_h1]:leading-none [&_h1]:font-extrabold [&_h1]:uppercase sm:[&_h1]:text-6xl">
      {children}
    </div>
  );
}
