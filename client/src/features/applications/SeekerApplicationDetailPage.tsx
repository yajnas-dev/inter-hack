import { Link, useParams } from 'react-router-dom';
import { formatDateTime } from '../../shared/lib/format';
import { CompanyLogo } from '../../shared/ui/Avatar';
import { LinkButton } from '../../shared/ui/Button';
import { StatusPill, statusLabel } from '../../shared/ui/Chip';
import { QueryBoundary } from '../../shared/ui/Feedback';
import { ApplicationStepper } from '../../shared/ui/Stepper';
import { useApplication } from './api';

export default function SeekerApplicationDetailPage() {
  const { id } = useParams();
  const application = useApplication(id);

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <nav aria-label="Breadcrumb" className="muted" style={{ marginBottom: 12, fontSize: 'var(--text-sm)' }}>
        <Link to="/seeker/jobs">My jobs</Link> / <span aria-current="page">Application</span>
      </nav>
      <QueryBoundary query={application}>
        {(a) => (
          <div className="stack">
            <div className="card">
              <div className="job-card-body">
                <CompanyLogo name={a.job.company.name} size="lg" />
                <div className="grow">
                  <h1 style={{ marginBottom: 2 }}>{a.job.title}</h1>
                  <div className="muted">
                    {a.job.company.name} &middot; {a.job.location}
                  </div>
                </div>
                <StatusPill status={a.status} />
              </div>
              <ApplicationStepper status={a.status} reached={(a.statusHistory ?? []).map((h) => h.status)} />
              <div className="row" style={{ marginTop: 8 }}>
                <LinkButton to={`/jobs/${a.job.id}`} variant="secondary" size="sm">
                  View job
                </LinkButton>
              </div>
            </div>

            {a.coverNote && (
              <div className="card">
                <h2>Your cover note</h2>
                <p className="pre" style={{ marginBottom: 0 }}>
                  {a.coverNote}
                </p>
              </div>
            )}

            <div className="card">
              <h2>Status history</h2>
              <ol className="timeline">
                {[...(a.statusHistory ?? [])].reverse().map((h) => (
                  <li key={`${h.status}-${h.changedAt}`}>
                    <strong>{statusLabel(h.status)}</strong>
                    <div className="faint" style={{ fontSize: 'var(--text-sm)' }}>
                      {formatDateTime(h.changedAt)}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
