import { useNavigate } from 'react-router-dom';
import { Icon } from '../../shared/ui/Icon';
import type { JobFilters } from './api';
import { filterParams } from './api';
import { type RememberedSearch, useSearchMemory } from './searchMemory';
import { activeFilterCount } from './useJobFilters';

/** Recent searches, pinned searches, and a "Save this search" toggle for the one on screen. */
export default function SearchMemoryBar({ filters }: { filters: JobFilters }) {
  const navigate = useNavigate();
  const { recent, saved, save, unsave, forget, isSaved } = useSearchMemory();
  const query = new URLSearchParams(filterParams(filters)).toString();
  const active = activeFilterCount(filters) > 0;
  const go = (s: RememberedSearch) => navigate(`/jobs?${s.query}`);
  const pinned = saved.filter((s) => s.query !== query);
  const recents = recent.filter((s) => s.query !== query && !isSaved(s.query)).slice(0, 4);

  if (!active && !pinned.length && !recents.length) return null;

  return (
    <div className="memory-bar" role="group" aria-label="Saved and recent searches">
      {active && (
        <button
          type="button"
          className="chip"
          aria-pressed={isSaved(query)}
          onClick={() => (isSaved(query) ? unsave(query) : save(query))}
          title={isSaved(query) ? 'Remove this saved search' : 'Keep this search for next time'}
        >
          <Icon name="bookmark" />
          {isSaved(query) ? 'Search saved' : 'Save this search'}
        </button>
      )}
      {pinned.map((s) => (
        <span key={s.id} className="chip chip-static">
          <Icon name="bookmark" />
          <button type="button" className="link-btn" onClick={() => go(s)}>
            {s.name ?? s.label}
          </button>
          <button type="button" className="link-btn" aria-label={`Remove saved search: ${s.label}`} onClick={() => unsave(s.query)}>
            <Icon name="x" />
          </button>
        </span>
      ))}
      {recents.length > 0 && <span className="muted memory-label">Recent</span>}
      {recents.map((s) => (
        <span key={s.id} className="chip chip-static">
          <button type="button" className="link-btn" onClick={() => go(s)}>
            {s.label}
          </button>
          <button type="button" className="link-btn" aria-label={`Forget recent search: ${s.label}`} onClick={() => forget(s.query)}>
            <Icon name="x" />
          </button>
        </span>
      ))}
    </div>
  );
}
