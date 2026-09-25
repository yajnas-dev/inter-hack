import { useCallback } from 'react';
import { usePersistedState } from '../../shared/lib/hooks';
import { useAuth } from '../auth/AuthContext';

export interface RememberedSearch {
  id: string;
  /** The /jobs query string, e.g. "title=react&location=pune". */
  query: string;
  /** Human label, built from the query. */
  label: string;
  name?: string;
}

const MAX_RECENT = 5;
const MAX_SAVED = 10;

/** "react · Pune · Full-time" from a jobs query string. */
export function describeSearch(query: string): string {
  const p = new URLSearchParams(query);
  const parts = [
    p.get('title'),
    p.get('location'),
    p.get('skills')?.split(',').join(', '),
    p.get('employmentType')?.split(',').join(' / '),
    p.get('minSalary') && `${p.get('minSalary')}+`
  ]
    .filter(Boolean)
    .map(String);
  return parts.join(' · ') || 'All jobs';
}

/** Recent and pinned searches, kept in this browser per account. Only the search-defining parameters are stored. */
export function useSearchMemory() {
  const { user } = useAuth();
  const scope = user?.id ?? 'guest';
  const [recent, setRecent] = usePersistedState<RememberedSearch[]>(`jp.recent.${scope}`, []);
  const [saved, setSaved] = usePersistedState<RememberedSearch[]>(`jp.saved-searches.${scope}`, []);

  const remember = useCallback(
    (query: string) => {
      if (!query) return;
      // Already the most recent search: nothing to store, and no state change (avoids a re-render loop).
      setRecent((list) =>
        list[0]?.query === query
          ? list
          : [{ id: query, query, label: describeSearch(query) }, ...list.filter((s) => s.query !== query)].slice(0, MAX_RECENT)
      );
    },
    [setRecent]
  );
  const save = useCallback(
    (query: string, name?: string) => {
      if (!query) return;
      setSaved((list) =>
        [
          { id: query, query, label: describeSearch(query), name: name?.trim() || undefined },
          ...list.filter((s) => s.query !== query)
        ].slice(0, MAX_SAVED)
      );
    },
    [setSaved]
  );
  const unsave = useCallback((query: string) => setSaved((list) => list.filter((s) => s.query !== query)), [setSaved]);
  const forget = useCallback((query: string) => setRecent((list) => list.filter((s) => s.query !== query)), [setRecent]);

  return { recent, saved, remember, save, unsave, forget, isSaved: (query: string) => saved.some((s) => s.query === query) };
}
