import { useCallback, useEffect, useState } from 'react';

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

/** useState that survives reloads (localStorage). Storage failures fall back to plain in-memory state. */
export function usePersistedState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  // Stable identity, so effects and callbacks that depend on the setter do not re-run on every render.
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        if (resolved === prev) return prev;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* storage unavailable: keep the value for this session */
        }
        return resolved;
      }),
    [key]
  );
  return [value, set];
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
