import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { JobListItemDTO } from '@jobportal/shared';
import { errorMessage } from '../../shared/api/http';
import { employmentLabel, formatDate } from '../../shared/lib/format';
import { LinkButton } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/Dialog';
import { EmptyState, QueryBoundary } from '../../shared/ui/Feedback';
import { Menu, MenuItem } from '../../shared/ui/Menu';
import { useToast } from '../../shared/ui/toast';
import { useJobMutations, useMyJobs } from './api';

type Pending = { kind: 'close' | 'delete'; job: JobListItemDTO } | null;

export default function MyJobsPage() {
  const jobs = useMyJobs();
  const { close, remove } = useJobMutations();
  const toast = useToast();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending>(null);

  const confirm = async () => {
    if (!pending) return;
    try {
      if (pending.kind === 'close') await close.mutateAsync(pending.job.id);
      else await remove.mutateAsync(pending.job.id);
      toast.success(pending.kind === 'close' ? 'Job closed.' : 'Job deleted.');
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

      <QueryBoundary query={jobs}>
        {({ jobs: list }) =>
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
                    <th>Job</th>
                    <th>Status</th>
                    <th>Posted</th>
                    <th style={{ textAlign: 'right' }}>Applicants</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((job) => (
                    <tr key={job.id}>
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
        title={pending?.kind === 'delete' ? 'Delete this job?' : 'Close this job?'}
        message={
          pending?.kind === 'delete'
            ? `"${pending.job.title}" and all of its applications will be permanently deleted.`
            : `"${pending?.job.title}" will stop appearing in search. Existing applications stay available.`
        }
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : 'Close job'}
        loading={close.isPending || remove.isPending}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      />
    </div>
  );
}
