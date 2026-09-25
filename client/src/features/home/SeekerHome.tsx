import { Link } from 'react-router-dom';
import { LinkButton } from '../../shared/ui/Button';
import { StatusPill } from '../../shared/ui/Chip';
import { JobCardSkeleton } from '../../shared/ui/Feedback';
import { useAuth } from '../auth/AuthContext';
import { useMyApplications } from '../applications/api';
import { lastChange, NEXT_STEP } from '../applications/nextStep';
import { emptyFilters, prefetchJob, useJobSearch } from '../jobs/api';
import JobCard from '../jobs/JobCard';
import { useSearchMemory } from '../jobs/searchMemory';
import { useSavedJobs, useSeekerJobState } from '../jobs/seekerState';
import { skillMatch, useMySkills } from '../jobs/skillMatch';
import { profileCompleteness } from '../profile/completeness';
import { useSeekerProfile } from '../profile/api';
import { useQueryClient } from '@tanstack/react-query';

/** What a signed-in job seeker sees first: where their applications stand and how to pick the search back up. */
export default function SeekerHome() {
  const { user } = useAuth();
  const applications = useMyApplications();
  const saved = useSavedJobs(1, true);
  const memory = useSearchMemory();
  const profile = useSeekerProfile();
  const latest = useJobSearch(emptyFilters);
  const state = useSeekerJobState();
  const mySkills = useMySkills();
  const queryClient = useQueryClient();

  const inProgress = [...(applications.data ?? [])]
    .filter((a) => a.status !== 'SELECTED' && a.status !== 'REJECTED')
    .sort((a, b) => new Date(lastChange(b)).getTime() - new Date(lastChange(a)).getTime())
    .slice(0, 4);
  const searches = [...memory.saved, ...memory.recent.filter((s) => !memory.isSaved(s.query))].slice(0, 6);
  const strength = profileCompleteness(profile.data);
  const nextFix = strength.items.find((i) => !i.done);
  const jobs = (latest.data?.pages[0]?.items ?? []).slice(0, 4);
  const first = user?.name.split(' ')[0];

  return (
    <div className="container stack" style={{ gap: 'var(--space-5)' }}>
      <div className="page-header">
        <div>
          <h1>Welcome back{first ? `, ${first}` : ''}</h1>
          <p>Pick up where you left off.</p>
        </div>
        <LinkButton to="/jobs" icon="search">
          Find jobs
        </LinkButton>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card" aria-labelledby="home-apps">
          <div className="card-header">
            <h2 id="home-apps">Applications in progress</h2>
            <Link to="/seeker/jobs">See all</Link>
          </div>
          {applications.isPending ? (
            <p className="muted">Loading…</p>
          ) : inProgress.length === 0 ? (
            <p className="muted">
              Nothing in progress. <Link to="/jobs">Find a job to apply to</Link>.
            </p>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {inProgress.map((a) => (
                <li key={a.id}>
                  <div className="row-between">
                    <Link to={`/seeker/applications/${a.id}`}>
                      <strong>{a.job.title}</strong>
                    </Link>
                    <StatusPill status={a.status} />
                  </div>
                  <div className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                    {a.job.company.name} &middot; {NEXT_STEP[a.status]}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="home-saved">
          <div className="card-header">
            <h2 id="home-saved">Saved jobs</h2>
            <Link to="/seeker/jobs">See all</Link>
          </div>
          {saved.isPending ? (
            <p className="muted">Loading…</p>
          ) : (saved.data?.jobs.length ?? 0) === 0 ? (
            <p className="muted">Tap the bookmark on a job to keep it here.</p>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {saved.data?.jobs.slice(0, 4).map((j) => (
                <li key={j.id}>
                  <Link to={`/jobs/${j.id}`}>
                    <strong>{j.title}</strong>
                  </Link>
                  <div className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                    {j.company.name} &middot; {j.location}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="home-searches">
          <h2 id="home-searches">Pick up your search</h2>
          {searches.length === 0 ? (
            <p className="muted">
              Searches you run or save show up here. <Link to="/jobs">Start searching</Link>.
            </p>
          ) : (
            <div className="tags">
              {searches.map((s) => (
                <Link key={s.id} className="chip" to={`/jobs?${s.query}`}>
                  {s.name ?? s.label}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="home-profile">
          <h2 id="home-profile">Profile strength</h2>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span className="muted">{strength.percent === 100 ? 'All set' : nextFix?.label}</span>
            <strong className="num">{strength.percent}%</strong>
          </div>
          <div
            className="meter"
            role="progressbar"
            aria-valuenow={strength.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Profile completeness"
          >
            <span style={{ width: `${strength.percent}%` }} />
          </div>
          {nextFix && (
            <p style={{ marginBottom: 0, marginTop: 12 }}>
              <Link to={nextFix.key === 'resume' ? '/seeker/resume' : '/seeker/profile'}>Finish your profile</Link>
            </p>
          )}
        </section>
      </div>

      <section aria-labelledby="home-latest">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h2 id="home-latest" style={{ margin: 0 }}>
            Latest jobs
          </h2>
          <Link to="/jobs">See all jobs</Link>
        </div>
        <div className="auto-grid">
          {/* biome-ignore lint/suspicious/noArrayIndexKey: static placeholders */}
          {latest.isPending && Array.from({ length: 4 }, (_, i) => <JobCardSkeleton key={`s${i}`} />)}
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              saved={state.saved.has(job.id)}
              applied={state.applied.has(job.id)}
              onToggleSave={state.toggleSave}
              match={mySkills && job.requiredSkills.length ? skillMatch(job.requiredSkills, mySkills) : null}
              onPrefetch={(id) => prefetchJob(queryClient, id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
