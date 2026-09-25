import { Link } from 'react-router-dom';
import { APPLICATION_STATUSES, type RecruiterOverviewDTO } from '@jobportal/shared';
import { timeAgo } from '../../shared/lib/format';
import { Avatar } from '../../shared/ui/Avatar';
import { LinkButton } from '../../shared/ui/Button';
import { StatusPill, statusLabel } from '../../shared/ui/Chip';
import { EmptyState, QueryBoundary, Skeleton } from '../../shared/ui/Feedback';
import { useAuth } from '../auth/AuthContext';
import { useRecruiterOverview } from './api';

const STAGE_VAR: Record<string, string> = {
  APPLIED: 'var(--st-applied)',
  SHORTLISTED: 'var(--st-shortlisted)',
  INTERVIEW: 'var(--st-interview)',
  SELECTED: 'var(--st-selected)',
  REJECTED: 'var(--st-rejected)'
};

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card kpi">
      <span className="value">{value}</span>
      <span className="label">{label}</span>
      {hint && <span className="delta">{hint}</span>}
    </div>
  );
}

function Funnel({ data }: { data: RecruiterOverviewDTO }) {
  const max = Math.max(1, ...APPLICATION_STATUSES.map((s) => data.applicantsByStatus[s] ?? 0));
  return (
    <section className="card" aria-labelledby="funnel-title">
      <h2 id="funnel-title">Hiring pipeline</h2>
      <div className="rank">
        {APPLICATION_STATUSES.map((s) => {
          const n = data.applicantsByStatus[s] ?? 0;
          return (
            <div key={s} className="rank-row">
              <span>{statusLabel(s)}</span>
              <strong className="num">{n}</strong>
              <div className="bar-track">
                <span style={{ width: `${(n / max) * 100}%`, background: STAGE_VAR[s] }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Overview({ data }: { data: RecruiterOverviewDTO }) {
  return (
    <div className="stack">
      <div className="auto-grid">
        <Kpi label="Open jobs" value={data.jobs.open} hint={`${data.jobs.closed} closed`} />
        <Kpi label="Total applicants" value={data.totalApplicants} />
        <Kpi label="New this week" value={data.newThisWeek} />
        <Kpi label="Selected" value={data.applicantsByStatus.SELECTED ?? 0} />
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Funnel data={data} />
        <section className="card" aria-labelledby="recent-title">
          <div className="card-header">
            <h2 id="recent-title">Recent applicants</h2>
          </div>
          {data.recent.length === 0 ? (
            <EmptyState icon="users" title="No applicants yet">
              Applications to your jobs will show up here.
            </EmptyState>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.recent.map((a) => (
                <li key={a.id} className="row-between">
                  <div className="row" style={{ gap: 10 }}>
                    <Avatar name={a.applicant.name} size="sm" />
                    <div>
                      <Link to={`/recruiter/jobs/${a.job.id}/applicants`}>
                        <strong>{a.applicant.name}</strong>
                      </Link>
                      <div className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                        {a.job.title} &middot; {timeAgo(a.appliedAt)}
                      </div>
                    </div>
                  </div>
                  <StatusPill status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default function RecruiterOverviewPage() {
  const overview = useRecruiterOverview();
  const { user } = useAuth();
  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>Welcome back{user ? `, ${user.name.split(' ')[0]}` : ''}</h1>
          <p>Here is what is happening across your jobs.</p>
        </div>
        <LinkButton to="/recruiter/jobs/new" icon="plus">
          Post a job
        </LinkButton>
      </div>
      <QueryBoundary query={overview} skeleton={<Skeleton height={220} />}>
        {(data) => <Overview data={data} />}
      </QueryBoundary>
    </div>
  );
}
