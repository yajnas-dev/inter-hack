import { Link } from 'react-router-dom';
import { APPLICATION_STATUSES, type RecruiterDashboardDTO } from '@jobportal/shared';
import { timeAgo } from '../../shared/lib/format';
import { Avatar } from '../../shared/ui/Avatar';
import { Button, LinkButton } from '../../shared/ui/Button';
import { errorMessage } from '../../shared/api/http';
import { useToast } from '../../shared/ui/toast';
import { StatusPill, statusLabel } from '../../shared/ui/Chip';
import { EmptyState, QueryBoundary, Skeleton } from '../../shared/ui/Feedback';
import { useAuth } from '../auth/AuthContext';
import { useQuickStatus, useRecruiterOverview } from './api';

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

function Funnel({ data }: { data: RecruiterDashboardDTO }) {
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

/** Applications nobody has looked at for three days, with the two most common answers one click away. */
function NeedsAttention({ data }: { data: RecruiterDashboardDTO }) {
  const move = useQuickStatus();
  const toast = useToast();
  if (data.staleCount === 0) return null;
  const act = async (id: string, status: 'SHORTLISTED' | 'REJECTED') => {
    try {
      await move.mutateAsync({ id, status });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <section className="card" aria-labelledby="attention-title">
      <div className="card-header">
        <h2 id="attention-title">Needs attention</h2>
        <span className="muted">{data.staleCount} waiting more than 3 days</span>
      </div>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {data.stale.map((a) => (
          <li key={a.id} className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div>
              <Link to={`/recruiter/jobs/${a.job.id}/applicants`}>
                <strong>{a.applicant.name}</strong>
              </Link>
              <div className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                {a.job.title} &middot; applied {timeAgo(a.appliedAt)}
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Button
                size="sm"
                variant="secondary"
                disabled={move.isPending}
                aria-label={`Shortlist ${a.applicant.name}`}
                onClick={() => act(a.id, 'SHORTLISTED')}
              >
                Shortlist
              </Button>
              <Button
                size="sm"
                variant="danger-outline"
                disabled={move.isPending}
                aria-label={`Reject ${a.applicant.name}`}
                onClick={() => act(a.id, 'REJECTED')}
              >
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {data.staleCount > data.stale.length && (
        <p className="muted" style={{ marginBottom: 0 }}>
          and {data.staleCount - data.stale.length} more in your jobs.
        </p>
      )}
    </section>
  );
}

function Overview({ data }: { data: RecruiterDashboardDTO }) {
  return (
    <div className="stack">
      <div className="auto-grid">
        <Kpi label="Open jobs" value={data.jobs.open} hint={`${data.jobs.closed} closed`} />
        <Kpi label="Total applicants" value={data.totalApplicants} />
        <Kpi label="New this week" value={data.newThisWeek} />
        <Kpi label="Selected" value={data.applicantsByStatus.SELECTED ?? 0} />
      </div>
      <NeedsAttention data={data} />
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
