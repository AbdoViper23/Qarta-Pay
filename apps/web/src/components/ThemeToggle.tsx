'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'qarta-theme';

/**
 * Runs in <head> before first paint: the saved choice, else light (the default look). Kept as a
 * string so layout.tsx can inline it; a theme set after paint would flash light first.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem('${KEY}');}catch(e){}if(t!=='dark'){t='light';}document.documentElement.dataset.theme=t;})();`;

function current(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Light / dark switch. Light by default; remembers the visitor's pick. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => setTheme(current()), []);

  const toggle = () => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // storage blocked: the choice lasts until reload
    }
    setTheme(next);
  };

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid size-11 shrink-0 place-items-center border-2 border-ink text-ink transition-colors hover:bg-ink hover:text-surface"
    >
      {/* Icon waits for mount: the server cannot know the theme. */}
      {theme === 'dark' ? (
        <Sun aria-hidden className="size-4" />
      ) : theme === 'light' ? (
        <Moon aria-hidden className="size-4" />
      ) : null}
    </button>
  );
}
