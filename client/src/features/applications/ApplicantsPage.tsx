import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { APPLICATION_STATUSES, nextStatuses, type ApplicationDTO, type ApplicationStatus } from '@jobportal/shared';
import { errorMessage } from '../../shared/api/http';
import { formatDate, timeAgo } from '../../shared/lib/format';
import { Avatar } from '../../shared/ui/Avatar';
import { Button, IconButton } from '../../shared/ui/Button';
import { StatusPill, Tag, statusLabel } from '../../shared/ui/Chip';
import { Drawer } from '../../shared/ui/Dialog';
import { EmptyState, ListSkeleton, QueryBoundary, Skeleton } from '../../shared/ui/Feedback';
import { Icon } from '../../shared/ui/Icon';
import { Menu, MenuItem } from '../../shared/ui/Menu';
import { useToast } from '../../shared/ui/toast';
import { useJob } from '../jobs/api';
import { downloadApplicationResume, useApplicantProfile, useBulkUpdateStatus, useJobApplicants, useUpdateStatus } from './api';

type View = 'board' | 'list';

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

function useMover(jobId: string) {
  const update = useUpdateStatus(jobId);
  const toast = useToast();
  return async (app: ApplicationDTO, status: ApplicationStatus) => {
    try {
      await update.mutateAsync({ id: app.id, status });
      toast.success(`${app.applicant.name ?? 'Candidate'} moved to ${statusLabel(status)}.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
}

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

// ---- board ----------------------------------------------------------------------------------

function Board({
  applications,
  onOpen,
  onMove
}: {
  applications: ApplicationDTO[];
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
              {cards.map((app) => (
                <article
                  key={app.id}
                  className={`k-card${dragging?.id === app.id ? ' dragging' : ''}`}
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
                  </div>
                  <div className="row-between" style={{ marginTop: 8 }}>
                    <span className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                      {app.resumeSnapshot ? 'Resume attached' : 'No resume'}
                    </span>
                    <MoveMenu app={app} onMove={(s) => onMove(app, s)} />
                  </div>
                </article>
              ))}
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
  jobId,
  onOpen,
  onMove
}: {
  applications: ApplicationDTO[];
  jobId: string;
  onOpen: (a: ApplicationDTO) => void;
  onMove: (a: ApplicationDTO, s: ApplicationStatus) => void;
}) {
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<ApplicationStatus | ''>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulk = useBulkUpdateStatus(jobId);
  const toast = useToast();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applications.filter(
      (a) => (!stage || a.status === stage) && (!q || `${a.applicant.name ?? ''} ${a.applicant.email ?? ''}`.toLowerCase().includes(q))
    );
  }, [applications, query, stage]);

  const picked = rows.filter((a) => selected.has(a.id));
  const common = picked.length ? APPLICATION_STATUSES.filter((s) => picked.every((a) => nextStatuses(a.status).includes(s))) : [];
  const allChecked = rows.length > 0 && rows.every((a) => selected.has(a.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const runBulk = async (status: ApplicationStatus) => {
    const { ok, failed } = await bulk.mutateAsync({ ids: picked.map((a) => a.id), status });
    if (ok) toast.success(`${ok} candidate${ok === 1 ? '' : 's'} moved to ${statusLabel(status)}.`);
    if (failed) toast.error(`${failed} could not be moved.`);
    setSelected(new Set());
  };

  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: 'wrap' }}>
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
          aria-label="Filter by stage"
          value={stage}
          onChange={(e) => setStage(e.target.value as ApplicationStatus | '')}
          style={{ width: 'auto' }}
        >
          <option value="">All stages</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {picked.length > 0 && (
        <div className="bulk-bar" role="region" aria-label="Bulk actions">
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

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState icon="users" title="No candidates match">
            Try a different search or stage.
          </EmptyState>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all candidates"
                    checked={allChecked}
                    onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((a) => a.id)))}
                  />
                </th>
                <th>Candidate</th>
                <th>Applied</th>
                <th>Stage</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((app) => (
                <tr key={app.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${app.applicant.name}`}
                      checked={selected.has(app.id)}
                      onChange={() => toggle(app.id)}
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
      )}
    </div>
  );
}

// ---- candidate drawer -----------------------------------------------------------------------

function CandidateDrawer({
  app,
  onClose,
  onMove
}: {
  app: ApplicationDTO | null;
  onClose: () => void;
  onMove: (a: ApplicationDTO, s: ApplicationStatus) => void;
}) {
  const profile = useApplicantProfile(app?.id);
  const toast = useToast();
  const options = app ? nextStatuses(app.status) : [];

  const download = async () => {
    if (!app) return;
    try {
      await downloadApplicationResume(app.id, app.resumeSnapshot?.originalName);
    } catch (err) {
      toast.error(errorMessage(err));
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
              <a href={`mailto:${app.applicant.email}`}>{app.applicant.email}</a>
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
            <Button variant="secondary" icon="download" onClick={download} disabled={!app.resumeSnapshot}>
              {app.resumeSnapshot ? `Download resume` : 'No resume'}
            </Button>
            {app.resumeSnapshot && (
              <div className="faint" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>
                {app.resumeSnapshot.originalName}
              </div>
            )}
          </div>

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
        </div>
      )}
    </Drawer>
  );
}

// ---- page -----------------------------------------------------------------------------------

export default function ApplicantsPage() {
  const { jobId = '' } = useParams();
  const job = useJob(jobId);
  const applicants = useJobApplicants(jobId);
  const move = useMover(jobId);
  const [view, setView] = useState<View>('board');
  const [openId, setOpenId] = useState<string | null>(null);

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

      <QueryBoundary query={applicants} skeleton={<ListSkeleton rows={3} />}>
        {(list) => {
          const open = list.find((a) => a.id === openId) ?? null;
          return list.length === 0 ? (
            <div className="card">
              <EmptyState icon="users" title="No applicants yet">
                Candidates appear here as soon as they apply.
              </EmptyState>
            </div>
          ) : (
            <>
              {view === 'board' ? (
                <Board applications={list} onOpen={(a) => setOpenId(a.id)} onMove={move} />
              ) : (
                <ListView applications={list} jobId={jobId} onOpen={(a) => setOpenId(a.id)} onMove={move} />
              )}
              <CandidateDrawer app={open} onClose={() => setOpenId(null)} onMove={move} />
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
