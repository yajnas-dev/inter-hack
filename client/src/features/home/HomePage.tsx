import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatSalary } from '../../shared/lib/format';
import { Button, LinkButton } from '../../shared/ui/Button';
import { CodeCard, F, K, N, P, S } from '../../shared/ui/CodeCard';
import { JobCardSkeleton } from '../../shared/ui/Feedback';
import { Icon } from '../../shared/ui/Icon';
import { useAuth } from '../auth/AuthContext';
import { emptyFilters, useFacets, useJobSearch } from '../jobs/api';
import JobCard from '../jobs/JobCard';
import { useSeekerJobState } from '../jobs/seekerState';
import { PageLoading } from '../../shared/ui/Feedback';
import SeekerHome from './SeekerHome';

const reveal = (i: number) => ({ '--i': i }) as React.CSSProperties;

/** Landing page: copy on the left, a live API exchange on the right, then hairline-ruled sections. */
function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const facets = useFacets();
  const latest = useJobSearch(emptyFilters);
  const state = useSeekerJobState();
  const [what, setWhat] = useState('');
  const [where, setWhere] = useState('');

  const go = (params: Record<string, string>) => navigate(`/jobs?${new URLSearchParams(params).toString()}`);
  const jobs = (latest.data?.pages[0]?.items ?? []).slice(0, 6);
  const sample = jobs[0];
  const open = facets.data?.totalOpen;
  const origin = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin;

  return (
    <>
      <section className="landing-hero wrap" aria-labelledby="hero-title">
        <div>
          <p className="eyebrow reveal" style={reveal(0)}>
            <span className="eyebrow-dot" aria-hidden="true" /> {open !== undefined ? `${open.toLocaleString()} open roles` : 'Open roles'}
          </p>
          <h1 className="landing-title reveal" id="hero-title" style={reveal(1)}>
            Find the role. Track every step.
          </h1>
          <p className="landing-lede reveal" style={reveal(2)}>
            Search jobs by skill, salary and location, apply with one resume, and watch each application move from Applied to Selected.
            Recruiters get a pipeline board instead of a spreadsheet.
          </p>
          <form
            className="hero-search reveal"
            style={reveal(3)}
            role="search"
            aria-label="Search jobs"
            onSubmit={(e) => {
              e.preventDefault();
              go({ ...(what.trim() && { title: what.trim() }), ...(where.trim() && { location: where.trim() }) });
            }}
          >
            <div className="input-icon">
              <Icon name="search" />
              <input
                aria-label="Job title or keyword"
                placeholder="Job title, keyword"
                value={what}
                onChange={(e) => setWhat(e.target.value)}
              />
            </div>
            <div className="input-icon">
              <Icon name="pin" />
              <input aria-label="Location" placeholder="City or location" value={where} onChange={(e) => setWhere(e.target.value)} />
            </div>
            <Button type="submit" size="lg">
              Search jobs
            </Button>
          </form>
          {facets.data && (
            <div className="popular reveal" style={reveal(4)} role="group" aria-label="Popular searches">
              <span className="eyebrow">Popular</span>
              {facets.data.locations.slice(0, 3).map((l) => (
                <button key={l.name} type="button" className="chip" onClick={() => go({ location: l.name })}>
                  {l.name}
                  <span className="count">{l.count}</span>
                </button>
              ))}
              {facets.data.skills.slice(0, 4).map((s) => (
                <button key={s.name} type="button" className="chip" onClick={() => go({ skills: s.name })}>
                  {s.name}
                  <span className="count">{s.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="demo reveal" style={reveal(2)} role="group" aria-label="Example API request and response">
          <CodeCard file="request.sh">
            <P>$</P> <F>curl</F> "{origin}/api/v1/jobs?limit=1"
            {'\n'}
            {'  '}-H <S>"Accept: application/json"</S>
          </CodeCard>
          <CodeCard file="response.json" status="200 OK">
            <P>{'{'}</P>
            {'\n  '}
            <K>"title"</K>
            <P>: </P>
            <S>"{sample?.title ?? 'Senior Backend Engineer'}"</S>
            <P>,</P>
            {'\n  '}
            <K>"company"</K>
            <P>: </P>
            <S>"{sample?.company.name ?? 'Northwind Labs'}"</S>
            <P>,</P>
            {'\n  '}
            <K>"location"</K>
            <P>: </P>
            <S>"{sample?.location ?? 'Pune'}"</S>
            <P>,</P>
            {'\n  '}
            <K>"salary"</K>
            <P>: </P>
            <S>"{sample ? formatSalary(sample.salaryMin, sample.salaryMax) : '1.2M - 2.4M'}"</S>
            <P>,</P>
            {'\n  '}
            <K>"experience"</K>
            <P>: </P>
            <N>{sample?.experienceRequired ?? 5}</N>
            <P>,</P>
            {'\n  '}
            <K>"skills"</K>
            <P>: [</P>
            <S>"{(sample?.requiredSkills ?? ['Node.js', 'MongoDB']).slice(0, 3).join('", "')}"</S>
            <P>]</P>
            {'\n'}
            <P>{'}'}</P>
          </CodeCard>
        </div>
      </section>

      <section className="strip wrap" aria-label="Trending skills">
        <span className="eyebrow">Trending skills</span>
        <ul className="trust">
          {(facets.data?.skills ?? []).slice(0, 6).map((s) => (
            <li key={s.name}>
              <Link to={`/jobs?skills=${encodeURIComponent(s.name)}`}>{s.name}</Link>
            </li>
          ))}
          {facets.isSuccess && facets.data.skills.length === 0 && <li>Post the first job to get started</li>}
        </ul>
        <Link className="link-arrow" to="/jobs">
          Browse all jobs <span aria-hidden="true">&rarr;</span>
        </Link>
      </section>

      <section className="section wrap" aria-labelledby="latest-title">
        <div className="section-head row-between">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" /> Just posted
            </p>
            <h2 className="section-title" id="latest-title">
              Latest jobs
            </h2>
          </div>
          <Link className="link-arrow" to="/jobs">
            See all jobs <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
        <div className="auto-grid">
          {/* biome-ignore lint/suspicious/noArrayIndexKey: static placeholders */}
          {latest.isPending && Array.from({ length: 6 }, (_, i) => <JobCardSkeleton key={`s${i}`} />)}
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              saved={state.saved.has(job.id)}
              applied={state.applied.has(job.id)}
              onToggleSave={state.toggleSave}
            />
          ))}
        </div>
        {latest.isSuccess && jobs.length === 0 && <p className="muted">No jobs have been posted yet. Check back soon.</p>}
      </section>

      <section className="section wrap" aria-labelledby="features-title">
        <div className="section-head">
          <p className="eyebrow">
            <span className="eyebrow-dot" aria-hidden="true" /> Built for both sides
          </p>
          <h2 className="section-title" id="features-title">
            One workflow, from application to offer.
          </h2>
          <p className="landing-lede">
            Every application follows the same four stages, so candidates always know where they stand and recruiters always know what is
            next.
          </p>
        </div>
        <div className="feature-grid">
          <article className="feature feature-wide">
            <div>
              <p className="feature-kicker">Status workflow</p>
              <h3 className="feature-title">No skipped steps, no lost candidates.</h3>
              <p className="feature-body">
                Applications move forward one stage at a time, or are rejected before the offer. The server enforces the order, so the board
                and the API can never disagree.
              </p>
            </div>
            <CodeCard file="applications.http" inline>
              <F>PATCH</F> /api/v1/applications/<P>:id</P>
              {'\n'}
              <P>{'{ '}</P>
              <K>"status"</K>
              <P>: </P>
              <S>"SHORTLISTED"</S>
              <P>{' }'}</P>
              {'\n\n'}
              <P>APPLIED</P> {'→'} <span className="c-key">SHORTLISTED</span> {'→'} <P>INTERVIEW</P> {'→'} <P>SELECTED</P>
              {'\n'}
              <P>{'          ↘ REJECTED'}</P>
            </CodeCard>
          </article>
          <article className="feature">
            <span className="feature-num" aria-hidden="true">
              01
            </span>
            <h3 className="feature-title">For job seekers</h3>
            <p className="feature-body">Apply once with your resume, save roles for later and follow every application on a timeline.</p>
            <ul className="feature-list">
              <li>Filters for salary, type, skills and date</li>
              <li>Saved jobs and an application tracker</li>
              <li>Notifications when a stage changes</li>
            </ul>
          </article>
          <article className="feature">
            <span className="feature-num" aria-hidden="true">
              02
            </span>
            <h3 className="feature-title">For recruiters</h3>
            <p className="feature-body">
              Post jobs, review candidates with their profiles and resumes, and move them through the pipeline.
            </p>
            <ul className="feature-list">
              <li>Drag-and-drop board and bulk actions</li>
              <li>Candidate profile and resume in one drawer</li>
              <li>Duplicate a posting in one click</li>
            </ul>
          </article>
        </div>
      </section>

      {(!user || user.role === 'RECRUITER') && (
        <section className="band" aria-labelledby="band-title">
          <div className="band-inner wrap">
            <div>
              <p className="eyebrow eyebrow-dark">
                <span className="eyebrow-dot" aria-hidden="true" /> For recruiters
              </p>
              <h2 className="band-title" id="band-title">
                Live in three steps.
              </h2>
              <p className="band-lede">
                Create a company, post a job, and start receiving applications. Each candidate lands on your board with a profile and resume
                attached.
              </p>
              <div className="row" style={{ marginTop: '1.6rem', gap: '1.25rem', flexWrap: 'wrap' }}>
                <LinkButton to={user ? '/recruiter/jobs/new' : '/register'} size="lg">
                  {user ? 'Post a job' : 'Start hiring'}
                </LinkButton>
                {!user && (
                  <Link className="band-link" to="/login">
                    Sign in <span aria-hidden="true">&rarr;</span>
                  </Link>
                )}
              </div>
            </div>
            <CodeCard file="post-a-job.http" status="201 Created">
              <F>POST</F> /api/v1/jobs
              {'\n'}
              <P>{'{'}</P>
              {'\n  '}
              <K>"title"</K>
              <P>: </P>
              <S>"Frontend Developer"</S>
              <P>,</P>
              {'\n  '}
              <K>"location"</K>
              <P>: </P>
              <S>"Bengaluru"</S>
              <P>,</P>
              {'\n  '}
              <K>"employmentType"</K>
              <P>: </P>
              <S>"FULL_TIME"</S>
              <P>,</P>
              {'\n  '}
              <K>"requiredSkills"</K>
              <P>: [</P>
              <S>"React"</S>
              <P>, </P>
              <S>"TypeScript"</S>
              <P>],</P>
              {'\n  '}
              <K>"vacancies"</K>
              <P>: </P>
              <N>2</N>
              {'\n'}
              <P>{'}'}</P>
            </CodeCard>
          </div>
        </section>
      )}
    </>
  );
}

/** Visitors get the landing page; a signed-in job seeker gets a home that continues their work. */
export default function HomePage() {
  const { user, status } = useAuth();
  if (status === 'loading') return <PageLoading label="Loading" />;
  return user?.role === 'JOB_SEEKER' ? <SeekerHome /> : <Landing />;
}
