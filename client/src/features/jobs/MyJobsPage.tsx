import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { JobListItemDTO } from '@jobportal/shared';
import { errorMessage } from '../../shared/api/http';
import { employmentLabel, formatDate } from '../../shared/lib/format';
import { Button, LinkButton } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/Dialog';
import { EmptyState, QueryBoundary } from '../../shared/ui/Feedback';
import { Icon } from '../../shared/ui/Icon';
import { Menu, MenuItem } from '../../shared/ui/Menu';
import { useToast } from '../../shared/ui/toast';
import { useJobMutations, useMyJobs } from './api';

type Pending = { kind: 'close' | 'delete'; job: JobListItemDTO } | { kind: 'bulk'; jobs: JobListItemDTO[] } | null;

export default function MyJobsPage() {
  const jobs = useMyJobs();
  const { close, reopen, remove } = useJobMutations();
  const toast = useToast();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'newest' | 'applicants'>('newest');
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const source = jobs.data?.items ?? [];
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = source.filter((j) => !q || `${j.title} ${j.location}`.toLowerCase().includes(q));
    return sort === 'applicants' ? [...filtered].sort((a, b) => (b.applicantCount ?? 0) - (a.applicantCount ?? 0)) : filtered;
  }, [source, query, sort]);
  const pickedOpen = rows.filter((j) => checked.has(j.id) && j.status === 'OPEN');
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const confirm = async () => {
    if (!pending) return;
    try {
      if (pending.kind === 'bulk') {
        await Promise.all(pending.jobs.map((j) => close.mutateAsync(j.id)));
        setChecked(new Set());
        toast.success(`${pending.jobs.length} jobs closed.`);
      } else if (pending.kind === 'close') {
        await close.mutateAsync(pending.job.id);
        toast.success('Job closed.');
      } else {
        await remove.mutateAsync(pending.job.id);
        toast.success('Job deleted.');
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setPending(null);
  };

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>Job postings</h1>
          <p>Everything you have posted, with how many people applied.</p>
        </div>
        <LinkButton to="/recruiter/jobs/new" icon="plus">
          Post a job
        </LinkButton>
      </div>

      {source.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="input-icon grow" style={{ minWidth: 220 }}>
            <Icon name="search" />
            <input
              type="search"
              aria-label="Search your jobs"
              placeholder="Search by title or location"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="select"
            aria-label="Sort jobs"
            value={sort}
            onChange={(e) => setSort(e.target.value as 'newest' | 'applicants')}
            style={{ width: 'auto' }}
          >
            <option value="newest">Newest first</option>
            <option value="applicants">Most applicants</option>
          </select>
        </div>
      )}

      {pickedOpen.length > 0 && (
        <div className="bulk-bar" role="region" aria-label="Bulk actions" style={{ marginBottom: 16 }}>
          <strong>
            {pickedOpen.length} open job{pickedOpen.length === 1 ? '' : 's'} selected
          </strong>
          <Button size="sm" variant="secondary" onClick={() => setPending({ kind: 'bulk', jobs: pickedOpen })}>
            Close selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <QueryBoundary query={jobs}>
        {({ items: list }) =>
          list.length === 0 ? (
            <div className="card">
              <EmptyState
                icon="briefcase"
                title="You have not posted any jobs yet"
                action={<LinkButton to="/recruiter/jobs/new">Post your first job</LinkButton>}
              >
                Once a job is live, applicants show up here.
              </EmptyState>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }} aria-label="Select" />
                    <th>Job</th>
                    <th>Status</th>
                    <th>Posted</th>
                    <th style={{ textAlign: 'right' }}>Applicants</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${job.title}`}
                          checked={checked.has(job.id)}
                          onChange={() => toggle(job.id)}
                        />
                      </td>
                      <td>
                        <Link to={`/recruiter/jobs/${job.id}/applicants`}>
                          <strong>{job.title}</strong>
                        </Link>
                        <div className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                          {job.location} &middot; {employmentLabel(job.employmentType)}
                        </div>
                      </td>
                      <td>
                        <span className={`pill pill-${job.status}`}>{job.status === 'OPEN' ? 'Open' : 'Closed'}</span>
                      </td>
                      <td className="num">{formatDate(job.createdAt)}</td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {job.applicantCount ?? 0}
                      </td>
                      <td>
                        <div className="cell-actions">
                          <Menu label="Actions" ariaLabel={`Actions for ${job.title}`} align="right">
                            {(closeMenu) => (
                              <>
                                <MenuItem
                                  icon="users"
                                  onClick={() => {
                                    closeMenu();
                                    navigate(`/recruiter/jobs/${job.id}/applicants`);
                                  }}
                                >
                                  View applicants
                                </MenuItem>
                                <MenuItem
                                  icon="edit"
                                  onClick={() => {
                                    closeMenu();
                                    navigate(`/recruiter/jobs/${job.id}/edit`);
                                  }}
                                >
                                  Edit
                                </MenuItem>
                                <MenuItem
                                  icon="copy"
                                  onClick={() => {
                                    closeMenu();
                                    navigate(`/recruiter/jobs/new?duplicate=${job.id}`);
                                  }}
                                >
                                  Duplicate
                                </MenuItem>
                                {job.status === 'CLOSED' && (
                                  <MenuItem
                                    icon="check"
                                    onClick={async () => {
                                      closeMenu();
                                      try {
                                        await reopen.mutateAsync(job.id);
                                        toast.success('Job reopened.');
                                      } catch (err) {
                                        toast.error(errorMessage(err));
                                      }
                                    }}
                                  >
                                    Reopen job
                                  </MenuItem>
                                )}
                                {job.status === 'OPEN' && (
                                  <MenuItem
                                    icon="x"
                                    onClick={() => {
                                      closeMenu();
                                      setPending({ kind: 'close', job });
                                    }}
                                  >
                                    Close job
                                  </MenuItem>
                                )}
                                {/* Candidates' history is kept: only a job nobody applied to can be deleted (the API enforces this too). */}
                                {job.applicantCount === 0 && (
                                  <MenuItem
                                    icon="trash"
                                    danger
                                    onClick={() => {
                                      closeMenu();
                                      setPending({ kind: 'delete', job });
                                    }}
                                  >
                                    Delete
                                  </MenuItem>
                                )}
                              </>
                            )}
                          </Menu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </QueryBoundary>

      <ConfirmDialog
        open={Boolean(pending)}
        danger={pending?.kind === 'delete'}
        title={pending?.kind === 'delete' ? 'Delete this job?' : pending?.kind === 'bulk' ? 'Close selected jobs?' : 'Close this job?'}
        message={
          pending?.kind === 'delete'
            ? `"${pending.job.title}" has no applications and will be permanently deleted.`
            : pending?.kind === 'bulk'
              ? `${pending.jobs.length} jobs will stop appearing in search. Their applications stay available, and you can reopen them later.`
              : `"${pending?.job.title}" will stop appearing in search. Existing applications stay available, and you can reopen it later.`
        }
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : pending?.kind === 'bulk' ? 'Close jobs' : 'Close job'}
        loading={close.isPending || remove.isPending}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      />
    </div>
  );
}
