import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { CompanyDTO } from '@jobportal/shared';
import { http } from '../../shared/api/http';
import { CompanyLogo } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { EmptyState, ErrorNote, ListSkeleton, QueryBoundary } from '../../shared/ui/Feedback';
import { Icon } from '../../shared/ui/Icon';
import { emptyFilters, useJobSearch } from '../jobs/api';
import JobCard from '../jobs/JobCard';
import { useSeekerJobState } from '../jobs/seekerState';

function useCompany(id: string) {
  return useQuery({
    queryKey: ['companies', id],
    enabled: Boolean(id),
    queryFn: async () => (await http.get<{ company: CompanyDTO }>(`/companies/${id}`)).data.company
  });
}

/** A company's public profile with its open jobs. */
export default function CompanyPublicPage() {
  const { id = '' } = useParams();
  const company = useCompany(id);
  const jobs = useJobSearch({ ...emptyFilters, company: id });
  const state = useSeekerJobState();
  const list = jobs.data?.pages.flatMap((p) => p.jobs) ?? [];

  return (
    <div className="container" style={{ maxWidth: 960 }}>
      <QueryBoundary query={company} skeleton={<ListSkeleton rows={2} />}>
        {(c) => (
          <>
            <div className="card">
              <div className="company-hero">
                <CompanyLogo name={c.name} logoUrl={c.logoUrl} size="xl" />
                <div className="grow">
                  <h1 style={{ marginBottom: 4 }}>{c.name}</h1>
                  <div className="muted row" style={{ gap: 12 }}>
                    {c.industry && (
                      <span>
                        <Icon name="building" /> {c.industry}
                      </span>
                    )}
                    {c.location && (
                      <span>
                        <Icon name="pin" /> {c.location}
                      </span>
                    )}
                    {c.website && (
                      <a
                        href={/^https?:\/\//.test(c.website) ? c.website : `https://${c.website}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <Icon name="globe" /> Website
                      </a>
                    )}
                  </div>
                </div>
              </div>
              {c.description && (
                <>
                  <hr className="divider" />
                  <h2>About</h2>
                  <p className="pre" style={{ marginBottom: 0 }}>
                    {c.description}
                  </p>
                </>
              )}
            </div>

            <h2 style={{ marginTop: 'var(--space-5)' }}>
              Open jobs{jobs.isSuccess && jobs.data.pages[0]?.total !== undefined ? ` (${jobs.data.pages[0].total})` : ''}
            </h2>
            {jobs.isError && <ErrorNote error={jobs.error} onRetry={() => void jobs.refetch()} />}
            {jobs.isPending && <ListSkeleton rows={2} />}
            {jobs.isSuccess && list.length === 0 && (
              <div className="card">
                <EmptyState icon="briefcase" title="No open jobs right now">
                  {c.name} has no open roles at the moment. <Link to="/jobs">Browse all jobs</Link>
                </EmptyState>
              </div>
            )}
            <div className="stack-sm">
              {list.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  saved={state.saved.has(job.id)}
                  applied={state.applied.has(job.id)}
                  onToggleSave={state.toggleSave}
                />
              ))}
              {jobs.hasNextPage && (
                <Button variant="secondary" loading={jobs.isFetchingNextPage} onClick={() => void jobs.fetchNextPage()}>
                  Load more
                </Button>
              )}
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
