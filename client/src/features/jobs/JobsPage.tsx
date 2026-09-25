import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useMediaQuery, usePersistedState } from '../../shared/lib/hooks';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { EmptyState, ErrorNote, ListSkeleton } from '../../shared/ui/Feedback';
import { Menu, MenuItem } from '../../shared/ui/Menu';
import { ShortcutsDialog } from '../../shared/ui/ShortcutsDialog';
import { filterParams, prefetchJob, useFacets, useJobSearch } from './api';
import { ActiveChips, FilterBar, SearchRow } from './FilterBar';
import JobCard from './JobCard';
import JobDetailView from './JobDetailView';
import SearchMemoryBar from './SearchMemoryBar';
import { useSearchMemory } from './searchMemory';
import { useSeekerJobState } from './seekerState';
import { skillMatch, useMySkills } from './skillMatch';
import { activeFilterCount, useJobFilters } from './useJobFilters';

/**
 * Search results as a split view: the list on the left, the selected job on the right (desktop).
 * On small screens the list stands alone and a card opens the full job page.
 */
export default function JobsPage() {
  const { filters, selectedId, update, clear, select } = useJobFilters();
  const search = useJobSearch(filters);
  const facets = useFacets();
  const state = useSeekerJobState();
  const desktop = useMediaQuery('(min-width: 1001px)');
  const toolbar = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const mySkills = useMySkills();
  const memory = useSearchMemory();
  const [density, setDensity] = usePersistedState<'comfortable' | 'compact'>('jp.density', 'comfortable');
  const [showShortcuts, setShowShortcuts] = useState(false);

  // The detail pane sticks just below the (variable-height) toolbar.
  useEffect(() => {
    const el = toolbar.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--toolbar-h', `${el.offsetHeight}px`);
    set();
    const observer = new ResizeObserver(set);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pages = search.data?.pages ?? [];
  const jobs = pages.flatMap((p) => p.items);
  const total = pages[0]?.meta.total;
  const activeId = desktop ? (selectedId ?? jobs[0]?.id ?? null) : null;

  // Remember what was searched so it is one click away next time.
  const query = new URLSearchParams(filterParams(filters)).toString();
  const remember = memory.remember;
  useEffect(() => {
    if (search.isSuccess && !search.isPlaceholderData && activeFilterCount(filters) > 0) remember(query);
  }, [search.isSuccess, search.isPlaceholderData, filters, query, remember]);

  // Keyboard: j/k move through results, s saves, / focuses the search box, ? lists the keys.
  const toggleSave = state.toggleSave;
  const isSeeker = state.isSeeker;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector('dialog[open]')) return;
      const at = Math.max(
        0,
        jobs.findIndex((j) => j.id === activeId)
      );
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.search-bar input')?.focus();
      } else if (e.key === '?') {
        setShowShortcuts(true);
      } else if ((e.key === 'j' || e.key === 'k') && jobs.length) {
        const next = jobs[Math.min(jobs.length - 1, Math.max(0, at + (e.key === 'j' ? 1 : -1)))];
        if (!next) return;
        if (desktop) select(next.id);
        requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-job-id="${next.id}"] a.title-link`)?.focus());
      } else if (e.key === 's' && isSeeker && activeId) {
        toggleSave(activeId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jobs, activeId, desktop, select, isSeeker, toggleSave]);

  const openJob = (id: string): boolean => {
    if (desktop) {
      select(id);
      return true;
    }
    return false;
  };

  return (
    <>
      <div className="jobs-toolbar" ref={toolbar}>
        <div className="inner">
          <SearchRow filters={filters} update={update} />
          <FilterBar filters={filters} update={update} clear={clear} facets={facets.data} />
          <ActiveChips filters={filters} update={update} clear={clear} />
          <SearchMemoryBar filters={filters} />
        </div>
      </div>

      <div className="container">
        <div className="results-head">
          <h1 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>
            <span aria-live="polite" className="num">
              {search.isSuccess
                ? total !== undefined
                  ? `${total.toLocaleString()} job${total === 1 ? '' : 's'}`
                  : `${jobs.length} jobs`
                : 'Jobs'}
            </span>
            {filters.title && <span className="muted"> for &ldquo;{filters.title}&rdquo;</span>}
          </h1>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="chip"
              aria-pressed={density === 'compact'}
              onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
            >
              <Icon name="list" />
              Compact
            </button>
            <button type="button" className="chip" onClick={() => setShowShortcuts(true)} aria-label="Show shortcuts">
              <kbd>?</kbd>
            </button>
            <Menu label={`Sort: ${filters.sort === 'salary' ? 'Highest salary' : 'Newest'}`} icon="sort" align="right">
              {(close) => (
                <>
                  <MenuItem
                    selected={filters.sort === 'newest'}
                    onClick={() => {
                      update({ sort: 'newest' });
                      close();
                    }}
                  >
                    Newest first
                  </MenuItem>
                  <MenuItem
                    selected={filters.sort === 'salary'}
                    onClick={() => {
                      update({ sort: 'salary' });
                      close();
                    }}
                  >
                    Highest salary
                  </MenuItem>
                </>
              )}
            </Menu>
          </div>
        </div>

        <div className="split">
          <div className={`split-list${density === 'compact' ? ' dense' : ''}${search.isPlaceholderData ? ' is-stale' : ''}`}>
            {search.isPending && <ListSkeleton rows={6} />}
            {search.isError && <ErrorNote error={search.error} onRetry={() => void search.refetch()} />}
            {search.isSuccess && jobs.length === 0 && (
              <div className="card">
                <EmptyState
                  icon="search"
                  title="No jobs match your search"
                  action={
                    activeFilterCount(filters) > 0 ? (
                      <Button variant="secondary" onClick={clear}>
                        Clear all filters
                      </Button>
                    ) : undefined
                  }
                >
                  Try a broader keyword, a different location, or fewer filters.
                </EmptyState>
              </div>
            )}
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                selected={activeId === job.id}
                saved={state.saved.has(job.id)}
                applied={state.applied.has(job.id)}
                onToggleSave={state.toggleSave}
                onOpen={(j) => openJob(j.id)}
                match={mySkills && job.requiredSkills.length ? skillMatch(job.requiredSkills, mySkills) : null}
                onPrefetch={(id) => prefetchJob(queryClient, id)}
              />
            ))}
            {search.hasNextPage && (
              <Button variant="secondary" loading={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>
                Load more jobs
              </Button>
            )}
          </div>

          <aside className="split-detail" aria-label="Job details">
            {activeId ? <JobDetailView id={activeId} pane key={activeId} /> : null}
          </aside>
        </div>
      </div>

      <ShortcutsDialog
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        shortcuts={[
          { keys: ['j'], label: 'Next job' },
          { keys: ['k'], label: 'Previous job' },
          { keys: ['s'], label: 'Save or unsave the selected job (job seekers)' },
          { keys: ['/'], label: 'Focus the search box' },
          { keys: ['Ctrl', 'K'], label: 'Open the command menu' },
          { keys: ['?'], label: 'Show this list' }
        ]}
      />
    </>
  );
}
