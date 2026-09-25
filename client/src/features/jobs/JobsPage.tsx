import { useEffect, useRef } from 'react';
import { useMediaQuery } from '../../shared/lib/hooks';
import { Button } from '../../shared/ui/Button';
import { EmptyState, ErrorNote, ListSkeleton } from '../../shared/ui/Feedback';
import { Menu, MenuItem } from '../../shared/ui/Menu';
import { useFacets, useJobSearch } from './api';
import { ActiveChips, FilterBar, SearchRow } from './FilterBar';
import JobCard from './JobCard';
import JobDetailView from './JobDetailView';
import { useSeekerJobState } from './seekerState';
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
  const jobs = pages.flatMap((p) => p.jobs);
  const total = pages[0]?.total;
  const activeId = desktop ? (selectedId ?? jobs[0]?.id ?? null) : null;

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

        <div className="split">
          <div className="split-list">
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
    </>
  );
}
