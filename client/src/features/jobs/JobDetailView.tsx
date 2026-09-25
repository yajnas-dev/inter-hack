import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { employmentLabel, formatDate, formatSalary, isNew, timeAgo } from '../../shared/lib/format';
import { Button, LinkButton } from '../../shared/ui/Button';
import { CompanyLogo } from '../../shared/ui/Avatar';
import { ErrorNote, Skeleton } from '../../shared/ui/Feedback';
import { Icon } from '../../shared/ui/Icon';
import { Menu, MenuItem } from '../../shared/ui/Menu';
import { useToast } from '../../shared/ui/toast';
import { useAuth } from '../auth/AuthContext';
import { useJob, useSimilarJobs } from './api';
import ApplyDialog from './ApplyDialog';
import JobCard from './JobCard';
import SaveButton from './SaveButton';
import { useSeekerJobState } from './seekerState';

function Fact({ icon, label, value }: { icon: 'pin' | 'briefcase' | 'money' | 'clock' | 'award' | 'users'; label: string; value: string }) {
  return (
    <div className="fact">
      <Icon name={icon} />
      <div>
        <div className="k">{label}</div>
        <div className="v">{value}</div>
      </div>
    </div>
  );
}

/** The job detail: used as a full page and as the right-hand pane of the split view. */
export default function JobDetailView({ id, pane }: { id: string; pane?: boolean }) {
  const job = useJob(id);
  const similar = useSimilarJobs(id);
  const { user } = useAuth();
  const state = useSeekerJobState();
  const navigate = useNavigate();
  const toast = useToast();
  const [applying, setApplying] = useState(false);

  if (job.isPending) {
    return (
      <div className="card stack" aria-busy="true">
        <div className="row">
          <Skeleton width={56} height={56} />
          <div className="grow stack-sm">
            <Skeleton width="55%" height={20} />
            <Skeleton width="30%" />
          </div>
        </div>
        <Skeleton height={80} />
        <Skeleton height={140} />
      </div>
    );
  }
  if (job.isError) return <ErrorNote error={job.error} onRetry={() => void job.refetch()} />;

  const j = job.data;
  const applied = state.applied.has(j.id);
  const open = j.status === 'OPEN';
  const url = `${window.location.origin}/jobs/${j.id}`;

  const startApply = () => {
    if (!user) navigate('/login', { state: { from: `/jobs/${j.id}` } });
    else setApplying(true);
  };

  const applyControl =
    !user || user.role === 'JOB_SEEKER' ? (
      applied ? (
        <LinkButton to="/seeker/jobs" variant="secondary" icon="check">
          Applied: view status
        </LinkButton>
      ) : (
        <Button icon="send" disabled={!open} onClick={startApply}>
          {open ? 'Apply' : 'Closed'}
        </Button>
      )
    ) : null;

  return (
    <div className={`job-detail ${pane ? '' : 'has-sticky-apply'}`}>
      <div className="card">
        <header>
          <CompanyLogo name={j.company.name} logoUrl={j.company.logoUrl} size="lg" />
          <div className="grow">
            <h1 style={{ marginBottom: 4 }}>
              {pane ? (
                <Link to={`/jobs/${j.id}`} style={{ color: 'inherit' }}>
                  {j.title}
                </Link>
              ) : (
                j.title
              )}
            </h1>
            <div className="row" style={{ gap: 8 }}>
              <Link to={`/companies/${j.company.id}`}>{j.company.name}</Link>
              <span className="faint">&middot;</span>
              <span className="muted">{j.location}</span>
              {isNew(j.createdAt) && <span className="pill pill-new">New</span>}
              {!open && <span className="pill pill-CLOSED">Closed</span>}
            </div>
            <div className="faint" style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>
              Posted {timeAgo(j.createdAt)}
            </div>
          </div>
        </header>

        <div className="actions">
          {applyControl}
          <SaveButton jobId={j.id} saved={state.saved.has(j.id)} onToggle={state.toggleSave} size="md" from={`/jobs/${j.id}`} />
          <Menu iconOnly icon="share" label="" ariaLabel="Share this job" align="left">
            {(close) => (
              <>
                <MenuItem
                  icon="copy"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(url);
                      toast.success('Link copied.');
                    } catch {
                      toast.error('Could not copy the link.');
                    }
                    close();
                  }}
                >
                  Copy link
                </MenuItem>
                <MenuItem icon="mail" href={`mailto:?subject=${encodeURIComponent(j.title)}&body=${encodeURIComponent(url)}`}>
                  Share by email
                </MenuItem>
              </>
            )}
          </Menu>
        </div>

        <div className="facts">
          <Fact icon="money" label="Salary range" value={formatSalary(j.salaryMin, j.salaryMax)} />
          <Fact icon="briefcase" label="Job type" value={employmentLabel(j.employmentType)} />
          <Fact icon="award" label="Experience" value={j.experienceRequired ? `${j.experienceRequired}+ years` : 'Fresher friendly'} />
          <Fact icon="pin" label="Location" value={j.location} />
          <Fact icon="users" label="Openings" value={String(j.vacancies ?? 1)} />
          <Fact icon="clock" label="Posted" value={formatDate(j.createdAt)} />
        </div>

        {j.requiredSkills.length > 0 && (
          <section aria-labelledby={`skills-${j.id}`}>
            <h2 id={`skills-${j.id}`}>Skills</h2>
            <div className="tags">
              {j.requiredSkills.map((s) => (
                <span key={s} className="tag">
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        <section style={{ marginTop: 'var(--space-5)' }} aria-labelledby={`about-${j.id}`}>
          <h2 id={`about-${j.id}`}>About the job</h2>
          <p className="pre">{j.description}</p>
        </section>

        {user?.role && user.role !== 'JOB_SEEKER' && (
          <p className="faint" style={{ marginTop: 16 }}>
            You're signed in as {user.role.toLowerCase().replace('_', ' ')}: applying and saving are for job seeker accounts.
          </p>
        )}
      </div>

      <div className="card" style={{ marginTop: 'var(--space-4)' }}>
        <div className="company-hero">
          <CompanyLogo name={j.company.name} logoUrl={j.company.logoUrl} size="lg" />
          <div className="grow">
            <h2 style={{ marginBottom: 2 }}>About {j.company.name}</h2>
            <div className="muted">{[j.company.industry, j.company.location].filter(Boolean).join(' · ')}</div>
          </div>
          <LinkButton to={`/companies/${j.company.id}`} variant="secondary" size="sm">
            View company
          </LinkButton>
        </div>
        {j.company.description && (
          <p style={{ marginTop: 12, marginBottom: 0 }} className="pre">
            {j.company.description}
          </p>
        )}
      </div>

      {similar.data && similar.data.length > 0 && (
        <section style={{ marginTop: 'var(--space-5)' }} aria-labelledby={`similar-${j.id}`}>
          <h2 id={`similar-${j.id}`}>Similar jobs</h2>
          <div className="stack-sm">
            {similar.data.map((s) => (
              <JobCard
                key={s.id}
                job={s}
                compact
                saved={state.saved.has(s.id)}
                applied={state.applied.has(s.id)}
                onToggleSave={state.isSeeker ? state.toggleSave : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {!pane && applyControl && (
        <div className="sticky-apply">
          {applyControl}
          <SaveButton jobId={j.id} saved={state.saved.has(j.id)} onToggle={state.toggleSave} size="md" from={`/jobs/${j.id}`} />
        </div>
      )}

      <ApplyDialog open={applying} onClose={() => setApplying(false)} jobId={j.id} jobTitle={j.title} companyName={j.company.name} />
    </div>
  );
}
