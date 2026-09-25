import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export type ThemePreference = 'system' | 'light' | 'dark';

const readTheme = (): ThemePreference => {
  try {
    const saved = localStorage.getItem('theme');
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
};

/** System / Light / Dark. "System" removes the attribute so the OS preference applies. */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readTheme);
  const apply = (next: ThemePreference) => {
    setPreference(next);
    try {
      if (next === 'system') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem('theme');
      } else {
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
      }
    } catch {
      /* storage unavailable: the choice still applies for this session */
    }
  };
  return { preference, setTheme: apply };
}
