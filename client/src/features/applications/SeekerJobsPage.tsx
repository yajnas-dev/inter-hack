import { useState } from 'react';
import { Link } from 'react-router-dom';
import { APPLICATION_STATUSES, type ApplicationDTO, type ApplicationStatus } from '@jobportal/shared';
import { formatDate, timeAgo } from '../../shared/lib/format';
import { CompanyLogo } from '../../shared/ui/Avatar';
import { LinkButton } from '../../shared/ui/Button';
import { StatusPill, statusLabel } from '../../shared/ui/Chip';
import { EmptyState, ListSkeleton, Pager, QueryBoundary } from '../../shared/ui/Feedback';
import { Tabs } from '../../shared/ui/Tabs';
import { ApplicationStepper } from '../../shared/ui/Stepper';
import JobCard from '../jobs/JobCard';
import { useSavedJobs, useSeekerJobState } from '../jobs/seekerState';
import { useMyApplications } from './api';
import { lastChange, NEXT_STEP, staleNote } from './nextStep';

type Tab = 'all' | 'saved' | ApplicationStatus;

function ApplicationRow({ app }: { app: ApplicationDTO }) {
  return (
    <article className="card">
      <div className="job-card-body">
        <CompanyLogo name={app.job.company.name} />
        <div className="grow">
          <div className="row-between">
            <h3 style={{ margin: 0 }}>
              <Link to={`/seeker/applications/${app.id}`}>{app.job.title}</Link>
            </h3>
            <StatusPill status={app.status} />
          </div>
          <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            {app.job.company.name} &middot; {app.job.location}
          </div>
          <ApplicationStepper status={app.status} />
          <p className="next-step">{NEXT_STEP[app.status]}</p>
          {staleNote(app) && <p className="next-step stale">{staleNote(app)}</p>}
          <div className="faint" style={{ fontSize: 'var(--text-xs)' }}>
            Applied {formatDate(app.appliedAt)} &middot; last update {timeAgo(lastChange(app))}
          </div>
        </div>
      </div>
    </article>
  );
}

/** "My jobs": saved jobs and every application, with tabs by stage and counts (LinkedIn/Indeed style). */
export default function SeekerJobsPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(1);
  const applications = useMyApplications();
  const saved = useSavedJobs(page, tab === 'saved');
  const state = useSeekerJobState();

  // Most recently changed first, so anything that moved is at the top.
  const all = [...(applications.data ?? [])].sort((a, b) => new Date(lastChange(b)).getTime() - new Date(lastChange(a)).getTime());
  const count = (s: ApplicationStatus) => all.filter((a) => a.status === s).length;
  const tabs = [
    { value: 'all' as const, label: 'Applications', count: all.length },
    { value: 'saved' as const, label: 'Saved', count: state.saved.size },
    ...APPLICATION_STATUSES.map((s) => ({ value: s, label: statusLabel(s), count: count(s) }))
  ];
  const shown = tab === 'all' ? all : all.filter((a) => a.status === tab);

  return (
    <div className="container" style={{ maxWidth: 900 }}>
      <div className="page-header">
        <div>
          <h1>My jobs</h1>
          <p>Track applications and revisit jobs you saved.</p>
        </div>
        <LinkButton to="/jobs" variant="secondary" icon="search">
          Find more jobs
        </LinkButton>
      </div>

      <Tabs
        tabs={tabs}
        value={tab}
        onChange={(v) => {
          setTab(v);
          setPage(1);
        }}
        label="Application stage"
      />

      <div className="stack" style={{ marginTop: 16 }}>
        {tab === 'saved' ? (
          <QueryBoundary query={saved} skeleton={<ListSkeleton rows={3} />}>
            {(data) =>
              data.jobs.length === 0 ? (
                <div className="card">
                  <EmptyState
                    icon="bookmark"
                    title="No saved jobs yet"
                    action={
                      <LinkButton to="/jobs" variant="secondary">
                        Browse jobs
                      </LinkButton>
                    }
                  >
                    Tap the bookmark on a job to keep it here for later.
                  </EmptyState>
                </div>
              ) : (
                <>
                  {data.jobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      saved={state.saved.has(job.id)}
                      applied={state.applied.has(job.id)}
                      onToggleSave={state.toggleSave}
                    />
                  ))}
                  <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
                </>
              )
            }
          </QueryBoundary>
        ) : (
          <QueryBoundary query={applications} skeleton={<ListSkeleton rows={3} />}>
            {() =>
              shown.length === 0 ? (
                <div className="card">
                  <EmptyState
                    icon="briefcase"
                    title={tab === 'all' ? "You haven't applied to any jobs yet" : `Nothing in ${statusLabel(tab as ApplicationStatus)}`}
                    action={<LinkButton to="/jobs">Find jobs</LinkButton>}
                  >
                    {tab === 'all'
                      ? 'When you apply, you can follow each application here.'
                      : 'Applications appear here when they reach this stage.'}
                  </EmptyState>
                </div>
              ) : (
                shown.map((a) => <ApplicationRow key={a.id} app={a} />)
              )
            }
          </QueryBoundary>
        )}
      </div>
    </div>
  );
}
