import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { APPLICATION_STATUSES, nextStatuses, type ApplicationDTO, type ApplicationStatus } from '@jobportal/shared';
import { errorMessage, saveBlob } from '../../shared/api/http';
import { formatDate, formatDateTime, timeAgo } from '../../shared/lib/format';
import { Avatar } from '../../shared/ui/Avatar';
import { Button, IconButton } from '../../shared/ui/Button';
import { StatusPill, Tag, statusLabel } from '../../shared/ui/Chip';
import { Drawer } from '../../shared/ui/Dialog';
import { EmptyState, QueryBoundary, Skeleton } from '../../shared/ui/Feedback';
import { Icon } from '../../shared/ui/Icon';
import { Menu, MenuItem } from '../../shared/ui/Menu';
import { ShortcutsDialog } from '../../shared/ui/ShortcutsDialog';
import { useToast } from '../../shared/ui/toast';
import { useJob } from '../jobs/api';
import MatchPanel from '../matching/MatchPanel';
import { skillMatch } from '../jobs/skillMatch';
import {
  downloadResume,
  useApplicationMatch,
  useAddNote,
  useApplicantProfile,
  useBulkUpdateStatus,
  useJobApplicants,
  useNotes,
  useUpdateStatus
} from './api';
import { daysSince } from './nextStep';

type View = 'board' | 'list';
type SortKey = 'newest' | 'match' | 'stage';

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const stageDays = (a: ApplicationDTO) => daysSince(a.stageSince ?? a.appliedAt);

/** AI fit analysis of this application (keyed per application so each candidate starts fresh). */
function RecruiterMatch({ applicationId }: { applicationId: string }) {
  return <MatchPanel mutation={useApplicationMatch(applicationId)} audience="recruiter" />;
}

function useMover(jobId: string) {
  const update = useUpdateStatus(jobId);
  const toast = useToast();
  return async (app: ApplicationDTO, status: ApplicationStatus) => {
    try {
      await update.mutateAsync({ id: app.id, status });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
}

/** The next stage forward (never Rejected); undefined for finished applications. */
const forwardStage = (status: ApplicationStatus): ApplicationStatus | undefined => nextStatuses(status).find((s) => s !== 'REJECTED');

function MoveMenu({ app, onMove }: { app: ApplicationDTO; onMove: (status: ApplicationStatus) => void }) {
  const options = nextStatuses(app.status);
  if (options.length === 0) return null;
  return (
    <Menu label="Move" ariaLabel={`Move ${app.applicant.name ?? 'candidate'}`} align="right">
      {(close) =>
        options.map((next) => (
          <MenuItem
            key={next}
            danger={next === 'REJECTED'}
            onClick={() => {
              close();
              onMove(next);
            }}
          >
            {next === 'REJECTED' ? 'Reject' : `Move to ${statusLabel(next)}`}
          </MenuItem>
        ))
      }
    </Menu>
  );
}

function MatchChip({ app }: { app: ApplicationDTO }) {
  if (app.matchTotal === undefined || app.matchCount === undefined) return null;
  return (
    <span className="pill pill-match" title={`Lists ${app.matchCount} of the ${app.matchTotal} required skills`}>
      {app.matchCount}/{app.matchTotal} skills
    </span>
  );
}

function BoardSkeleton() {
  return (
    <div className="board" role="status" aria-label="Loading candidates">
      {APPLICATION_STATUSES.map((s) => (
        <div key={s} className="column">
          <div className="column-head">
            <Skeleton width={80} height={14} />
          </div>
          <div className="column-body">
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- board ----------------------------------------------------------------------------------

function Board({
  applications,
  selected,
  onToggle,
  onOpen,
  onMove
}: {
  applications: ApplicationDTO[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (a: ApplicationDTO) => void;
  onMove: (a: ApplicationDTO, s: ApplicationStatus) => void;
}) {
  const [dragging, setDragging] = useState<ApplicationDTO | null>(null);
  const [over, setOver] = useState<ApplicationStatus | null>(null);
  const canDrop = (status: ApplicationStatus) => Boolean(dragging && nextStatuses(dragging.status).includes(status));

  return (
    <div className="board">
      {APPLICATION_STATUSES.map((status) => {
        const cards = applications.filter((a) => a.status === status);
        const cls = ['column', dragging && over === status ? (canDrop(status) ? 'drop-ok' : 'drop-no') : ''].filter(Boolean).join(' ');
        return (
          <section
            key={status}
            className={cls}
            aria-label={`${statusLabel(status)}, ${cards.length} candidates`}
            onDragOver={(e) => {
              if (dragging) {
                if (canDrop(status)) e.preventDefault();
                setOver(status);
              }
            }}
            onDragLeave={() => setOver((o) => (o === status ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging && canDrop(status)) onMove(dragging, status);
              setDragging(null);
              setOver(null);
            }}
          >
            <div className="column-head">
              <span>{statusLabel(status)}</span>
              <span className="count">{cards.length}</span>
            </div>
            <div className="column-body">
              {cards.length === 0 && <div className="board-empty">No candidates</div>}
              {cards.map((app) => {
                const forward = forwardStage(app.status);
                return (
                  <article
                    key={app.id}
                    className={`k-card${dragging?.id === app.id ? ' dragging' : ''}${selected.has(app.id) ? ' picked' : ''}`}
                    draggable={nextStatuses(app.status).length > 0}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', app.id);
                      setDragging(app);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onKeyDown={(e) => {
                      // Shift+Right moves the focused candidate one stage forward (same rule as dragging).
                      if (e.shiftKey && e.key === 'ArrowRight' && forward) {
                        e.preventDefault();
                        onMove(app, forward);
                      }
                    }}
                  >
                    <div className="row" style={{ gap: 8 }}>
                      <Avatar name={app.applicant.name} size="sm" />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <button type="button" className="name truncate" onClick={() => onOpen(app)}>
                          {app.applicant.name}
                        </button>
                        <div className="faint truncate" style={{ fontSize: 'var(--text-xs)' }}>
                          Applied {timeAgo(app.appliedAt)}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        aria-label={`Select ${app.applicant.name}`}
                        checked={selected.has(app.id)}
                        onChange={() => onToggle(app.id)}
                      />
                    </div>
                    {app.coverNote && <p className="k-snippet">{app.coverNote}</p>}
                    <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <span className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                        {stageDays(app) === 0 ? 'Moved today' : `In stage ${stageDays(app)}d`}
                      </span>
                      <MatchChip app={app} />
                    </div>
                    <div className="row-between" style={{ marginTop: 8 }}>
                      <span className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                        {app.resume ? 'Resume attached' : 'No resume'}
                      </span>
                      <MoveMenu app={app} onMove={(s) => onMove(app, s)} />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---- list -----------------------------------------------------------------------------------

function ListView({
  applications,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  onMove
}: {
  applications: ApplicationDTO[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], on: boolean) => void;
  onOpen: (a: ApplicationDTO) => void;
  onMove: (a: ApplicationDTO, s: ApplicationStatus) => void;
}) {
  const allChecked = applications.length > 0 && applications.every((a) => selected.has(a.id));
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>
              <input
                type="checkbox"
                aria-label="Select all candidates"
                checked={allChecked}
                onChange={() =>
                  onToggleAll(
                    applications.map((a) => a.id),
                    !allChecked
                  )
                }
              />
            </th>
            <th>Candidate</th>
            <th>Applied</th>
            <th>Stage</th>
            <th>Skills</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {applications.map((app) => (
            <tr key={app.id}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Select ${app.applicant.name}`}
                  checked={selected.has(app.id)}
                  onChange={() => onToggle(app.id)}
                />
              </td>
              <td>
                <div className="row" style={{ gap: 10 }}>
                  <Avatar name={app.applicant.name} size="sm" />
                  <div>
                    <button type="button" className="link-btn" onClick={() => onOpen(app)}>
                      {app.applicant.name}
                    </button>
                    <div className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                      {app.applicant.email}
                    </div>
                  </div>
                </div>
              </td>
              <td className="num">{formatDate(app.appliedAt)}</td>
              <td>
                <StatusPill status={app.status} />
                <div className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                  {stageDays(app) === 0 ? 'today' : `${stageDays(app)}d`}
                </div>
              </td>
              <td>
                <MatchChip app={app} />
              </td>
              <td>
                <div className="cell-actions">
                  <MoveMenu app={app} onMove={(s) => onMove(app, s)} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- candidate drawer -----------------------------------------------------------------------

function NotesPanel({ applicationId }: { applicationId: string }) {
  const notes = useNotes(applicationId);
  const add = useAddNote(applicationId);
  const toast = useToast();
  const [text, setText] = useState('');

  const submit = async () => {
    const value = text.trim();
    if (!value) return;
    try {
      await add.mutateAsync(value);
      setText('');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <section aria-labelledby="notes-title">
      <h4 id="notes-title">Private notes</h4>
      <p className="faint" style={{ fontSize: 'var(--text-xs)', marginTop: 0 }}>
        Only you can see these. The candidate never does.
      </p>
      <div className="field">
        <label htmlFor="note-text">Add a note</label>
        <textarea id="note-text" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <Button size="sm" variant="secondary" loading={add.isPending} disabled={!text.trim()} onClick={submit}>
        Save note
      </Button>
      {notes.isPending && <Skeleton width="70%" style={{ marginTop: 12 }} />}
      <ul className="notes-list">
        {notes.data?.map((n) => (
          <li key={n.id}>
            <p className="pre" style={{ margin: 0 }}>
              {n.text}
            </p>
            <span className="faint" style={{ fontSize: 'var(--text-xs)' }}>
              {formatDateTime(n.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CandidateDrawer({
  app,
  requiredSkills,
  jobTitle,
  hasPrev,
  hasNext,
  onStep,
  onClose,
  onMove
}: {
  app: ApplicationDTO | null;
  requiredSkills: string[];
  jobTitle: string;
  hasPrev: boolean;
  hasNext: boolean;
  onStep: (delta: -1 | 1) => void;
  onClose: () => void;
  onMove: (a: ApplicationDTO, s: ApplicationStatus) => void;
}) {
  const profile = useApplicantProfile(app?.id);
  const toast = useToast();
  const options = app ? nextStatuses(app.status) : [];
  const fit =
    profile.data && requiredSkills.length ? skillMatch(requiredSkills, new Set(profile.data.skills.map((s) => s.toLowerCase()))) : null;

  const download = async () => {
    if (!app) return;
    try {
      if (app.resume) await downloadResume(app.resume.id, app.resume.originalName);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const copyEmail = async () => {
    if (!app?.applicant.email) return;
    try {
      await navigator.clipboard.writeText(app.applicant.email);
      toast.success('Email copied.');
    } catch {
      toast.error('Could not copy the email.');
    }
  };

  return (
    <Drawer
      open={Boolean(app)}
      onClose={onClose}
      title="Candidate"
      footer={
        app && (
          <>
            <IconButton icon="left" label="Previous candidate" disabled={!hasPrev} onClick={() => onStep(-1)} />
            <IconButton icon="right" label="Next candidate" disabled={!hasNext} onClick={() => onStep(1)} />
            <span className="grow" />
            {options.map((next) => (
              <Button
                key={next}
                variant={next === 'REJECTED' ? 'danger-outline' : 'primary'}
                onClick={() => {
                  onMove(app, next);
                  onClose();
                }}
              >
                {next === 'REJECTED' ? 'Reject' : `Move to ${statusLabel(next)}`}
              </Button>
            ))}
            {options.length === 0 && <span className="muted">This application is final.</span>}
          </>
        )
      }
    >
      {app && (
        <div className="stack">
          <div className="row">
            <Avatar name={app.applicant.name} size="xl" />
            <div className="grow">
              <h3 style={{ margin: 0 }}>{app.applicant.name}</h3>
              {profile.data?.headline && <div className="muted">{profile.data.headline}</div>}
              <div style={{ marginTop: 4 }}>
                <StatusPill status={app.status} />
              </div>
            </div>
          </div>

          <div className="stack-sm" style={{ fontSize: 'var(--text-sm)' }}>
            <div className="row" style={{ gap: 8 }}>
              <Icon name="mail" />
              <a href={`mailto:${app.applicant.email}?subject=${encodeURIComponent(`Your application for ${jobTitle}`)}`}>
                {app.applicant.email}
              </a>
              <button type="button" className="link-btn" onClick={copyEmail}>
                Copy
              </button>
            </div>
            {profile.data?.phone && (
              <div className="row" style={{ gap: 8 }}>
                <Icon name="phone" />
                {profile.data.phone}
              </div>
            )}
            {profile.data?.address && (
              <div className="row" style={{ gap: 8 }}>
                <Icon name="pin" />
                {profile.data.address}
              </div>
            )}
            <div className="row" style={{ gap: 8 }}>
              <Icon name="calendar" />
              Applied {formatDate(app.appliedAt)}
            </div>
          </div>

          <div>
            <Button variant="secondary" icon="download" onClick={download} disabled={!app.resume}>
              {app.resume ? `Download resume` : 'No resume'}
            </Button>
            {app.resume && (
              <div className="faint" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>
                {app.resume.originalName}
              </div>
            )}
          </div>

          <RecruiterMatch key={app.id} applicationId={app.id} />

          {fit && (
            <section className="match-box" aria-label="Skill match">
              <strong>
                Lists {fit.have.length} of {fit.have.length + fit.missing.length} required skills
              </strong>
              <div className="tags">
                {fit.have.map((s) => (
                  <span key={s} className="tag tag-have">
                    {s} (has)
                  </span>
                ))}
                {fit.missing.map((s) => (
                  <span key={s} className="tag tag-missing">
                    {s} (not listed)
                  </span>
                ))}
              </div>
            </section>
          )}

          {app.coverNote && (
            <section>
              <h4>Cover note</h4>
              <p className="pre" style={{ margin: 0 }}>
                {app.coverNote}
              </p>
            </section>
          )}

          {profile.isPending && (
            <div className="stack-sm" aria-busy="true">
              <Skeleton width="50%" height={16} />
              <Skeleton width="90%" />
              <Skeleton width="70%" />
            </div>
          )}
          {profile.isError && <div className="error">Could not load the candidate's profile.</div>}

          {profile.data && (
            <>
              {profile.data.skills.length > 0 && (
                <section>
                  <h4>Skills</h4>
                  <div className="tags">
                    {profile.data.skills.map((s) => (
                      <Tag key={s}>{s}</Tag>
                    ))}
                  </div>
                </section>
              )}
              {profile.data.experience.length > 0 && (
                <section>
                  <h4>Experience</h4>
                  <ul className="stack-sm" style={{ listStyle: 'none', padding: 0 }}>
                    {profile.data.experience.map((e, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: read-only list
                      <li key={i}>
                        <strong>{str(e.title)}</strong> {e.company ? <span className="muted">at {str(e.company)}</span> : null}
                        {e.description ? (
                          <div className="muted pre" style={{ fontSize: 'var(--text-sm)' }}>
                            {str(e.description)}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {profile.data.education.length > 0 && (
                <section>
                  <h4>Education</h4>
                  <ul className="stack-sm" style={{ listStyle: 'none', padding: 0 }}>
                    {profile.data.education.map((e, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: read-only list
                      <li key={i}>
                        <strong>{str(e.degree)}</strong> {e.fieldOfStudy ? `in ${str(e.fieldOfStudy)}` : ''}
                        <div className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                          {str(e.institution)} {e.startYear || e.endYear ? `(${str(e.startYear)} - ${str(e.endYear)})` : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          <NotesPanel applicationId={app.id} />
        </div>
      )}
    </Drawer>
  );
}

// ---- export ---------------------------------------------------------------------------------

const csvCell = (v: string | number | undefined) =>
  `"${String(v ?? '')
    .replace(/"/g, '""')
    .replace(/\r?\n/g, ' ')}"`;

function exportCsv(list: ApplicationDTO[], jobTitle: string) {
  const header = ['Name', 'Email', 'Stage', 'Applied', 'Days in stage', 'Skills matched', 'Cover note'];
  const rows = list.map((a) => [
    a.applicant.name,
    a.applicant.email,
    statusLabel(a.status),
    new Date(a.appliedAt).toISOString().slice(0, 10),
    stageDays(a),
    a.matchTotal ? `${a.matchCount ?? 0}/${a.matchTotal}` : '',
    a.coverNote
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  saveBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    `applicants-${jobTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'job'}.csv`
  );
}

// ---- page -----------------------------------------------------------------------------------

export default function ApplicantsPage() {
  const { jobId = '' } = useParams();
  const job = useJob(jobId);
  const applicants = useJobApplicants(jobId);
  const move = useMover(jobId);
  const bulk = useBulkUpdateStatus(jobId);
  const toast = useToast();
  const [view, setView] = useState<View>('board');
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showKeys, setShowKeys] = useState(false);

  const all = applicants.data ?? [];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = all.filter((a) => !q || `${a.applicant.name ?? ''} ${a.applicant.email ?? ''}`.toLowerCase().includes(q));
    if (sort === 'match') return [...filtered].sort((a, b) => (b.matchCount ?? -1) - (a.matchCount ?? -1));
    if (sort === 'stage')
      return [...filtered].sort(
        (a, b) => new Date(a.stageSince ?? a.appliedAt).getTime() - new Date(b.stageSince ?? b.appliedAt).getTime()
      );
    return filtered;
  }, [all, query, sort]);

  const picked = shown.filter((a) => selected.has(a.id));
  const common = picked.length ? APPLICATION_STATUSES.filter((s) => picked.every((a) => nextStatuses(a.status).includes(s))) : [];
  const hasMatch = all.some((a) => a.matchTotal !== undefined);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAll = (ids: string[], on: boolean) => setSelected(on ? new Set(ids) : new Set());

  const runBulk = async (status: ApplicationStatus) => {
    const { ok, failed } = await bulk.mutateAsync({ ids: picked.map((a) => a.id), status });
    if (ok) toast.success(`${ok} candidate${ok === 1 ? '' : 's'} moved to ${statusLabel(status)}.`);
    if (failed) toast.error(`${failed} could not be moved.`);
    setSelected(new Set());
  };

  const openIndex = shown.findIndex((a) => a.id === openId);
  const open = openIndex >= 0 ? shown[openIndex] : (all.find((a) => a.id === openId) ?? null);
  const step = (delta: -1 | 1) => {
    const next = shown[openIndex + delta];
    if (next) setOpenId(next.id);
  };

  return (
    <div className="container" style={{ maxWidth: 1320 }}>
      <nav aria-label="Breadcrumb" className="muted" style={{ marginBottom: 12, fontSize: 'var(--text-sm)' }}>
        <Link to="/recruiter/jobs">Jobs</Link> / <span aria-current="page">{job.data?.title ?? 'Applicants'}</span>
      </nav>
      <div className="page-header">
        <div>
          <h1>Applicants</h1>
          <p>{job.data ? `${job.data.title} · ${job.data.location}` : ''}</p>
        </div>
        <div className="segmented" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')}>
            <Icon name="columns" /> Board
          </button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
            <Icon name="list" /> List
          </button>
        </div>
      </div>

      {all.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="input-icon grow" style={{ minWidth: 220 }}>
            <Icon name="search" />
            <input
              type="search"
              aria-label="Search candidates"
              placeholder="Search by name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="select"
            aria-label="Sort candidates"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            style={{ width: 'auto' }}
          >
            <option value="newest">Newest first</option>
            {hasMatch && <option value="match">Best skill match</option>}
            <option value="stage">Longest in stage</option>
          </select>
          <Button variant="secondary" icon="download" onClick={() => exportCsv(shown, job.data?.title ?? 'job')}>
            Export CSV
          </Button>
          <button type="button" className="chip" onClick={() => setShowKeys(true)} aria-label="Show shortcuts">
            <kbd>?</kbd>
          </button>
        </div>
      )}

      {picked.length > 0 && (
        <div className="bulk-bar" role="region" aria-label="Bulk actions" style={{ marginBottom: 16 }}>
          <strong>{picked.length} selected</strong>
          {common.length === 0 ? (
            <span className="muted">These candidates have no stage in common to move to.</span>
          ) : (
            common.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === 'REJECTED' ? 'danger-outline' : 'secondary'}
                loading={bulk.isPending}
                onClick={() => runBulk(s)}
              >
                {s === 'REJECTED' ? 'Reject' : `Move to ${statusLabel(s)}`}
              </Button>
            ))
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <QueryBoundary query={applicants} skeleton={<BoardSkeleton />}>
        {() =>
          all.length === 0 ? (
            <div className="card">
              <EmptyState icon="users" title="No applicants yet">
                Candidates appear here as soon as they apply.
              </EmptyState>
            </div>
          ) : shown.length === 0 ? (
            <div className="card">
              <EmptyState icon="users" title="No candidates match">
                Try a different search.
              </EmptyState>
            </div>
          ) : (
            <>
              {view === 'board' ? (
                <Board applications={shown} selected={selected} onToggle={toggle} onOpen={(a) => setOpenId(a.id)} onMove={move} />
              ) : (
                <ListView
                  applications={shown}
                  selected={selected}
                  onToggle={toggle}
                  onToggleAll={toggleAll}
                  onOpen={(a) => setOpenId(a.id)}
                  onMove={move}
                />
              )}
              <CandidateDrawer
                app={open}
                requiredSkills={job.data?.requiredSkills ?? []}
                jobTitle={job.data?.title ?? 'the role'}
                hasPrev={openIndex > 0}
                hasNext={openIndex >= 0 && openIndex < shown.length - 1}
                onStep={step}
                onClose={() => setOpenId(null)}
                onMove={move}
              />
            </>
          )
        }
      </QueryBoundary>

      <ShortcutsDialog
        open={showKeys}
        onClose={() => setShowKeys(false)}
        shortcuts={[
          { keys: ['Shift', '→'], label: 'Move the focused candidate one stage forward (board)' },
          { keys: ['Space'], label: 'Tick the focused candidate’s checkbox' },
          { keys: ['Esc'], label: 'Close the candidate panel' },
          { keys: ['Ctrl', 'K'], label: 'Open the command menu' }
        ]}
      />
    </div>
  );
}
