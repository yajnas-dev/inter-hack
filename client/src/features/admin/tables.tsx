import { useState, type ReactNode } from 'react';
import { ROLES, type Role } from '@jobportal/shared';
import { errorMessage } from '../../shared/api/http';
import { formatDate } from '../../shared/lib/format';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { StatusPill } from '../../shared/ui/Chip';
import { ConfirmDialog } from '../../shared/ui/Dialog';
import { Pager, QueryBoundary } from '../../shared/ui/Feedback';
import { useToast } from '../../shared/ui/toast';
import { DataTable, type Column } from './DataTable';
import { useAdminApplications, useAdminCompanies, useAdminJobs, useAdminMutations, useAdminUsers } from './api';

interface Pending {
  title: string;
  message: string;
  confirmLabel: string;
  run: () => Promise<unknown>;
  done: string;
}

/** One confirm dialog per page: `ask` opens it, confirming runs the action and toasts the outcome. */
function useConfirm() {
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const dialog = (
    <ConfirmDialog
      open={Boolean(pending)}
      danger
      title={pending?.title ?? ''}
      message={pending?.message}
      confirmLabel={pending?.confirmLabel}
      loading={busy}
      onCancel={() => setPending(null)}
      onConfirm={async () => {
        if (!pending) return;
        setBusy(true);
        try {
          await pending.run();
          toast.success(pending.done);
        } catch (err) {
          toast.error(errorMessage(err));
        }
        setBusy(false);
        setPending(null);
      }}
    />
  );
  return { ask: setPending, dialog };
}

function Page({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<Role | ''>('');
  const users = useAdminUsers(page, role);
  const { setActive, deleteUser } = useAdminMutations();
  const toast = useToast();
  const { ask, dialog } = useConfirm();

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await setActive.mutateAsync({ id, isActive });
      toast.success(isActive ? 'User activated.' : 'User deactivated.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Page
      title="Users"
      subtitle="Every account on the platform."
      actions={
        <div className="field" style={{ margin: 0, minWidth: 160 }}>
          <label htmlFor="role-filter">Role</label>
          <select
            id="role-filter"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Role | '');
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <QueryBoundary query={users}>
        {(data) => {
          const columns: Column<(typeof data.users)[number]>[] = [
            {
              key: 'name',
              header: 'Name',
              value: (u) => u.name,
              render: (u) => (
                <div className="row" style={{ gap: 10 }}>
                  <Avatar name={u.name} size="sm" />
                  <div>
                    <strong>{u.name}</strong>
                    <div className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                      {u.email}
                    </div>
                  </div>
                </div>
              )
            },
            { key: 'role', header: 'Role', value: (u) => u.role, render: (u) => <span className="pill pill-neutral">{u.role}</span> },
            {
              key: 'active',
              header: 'Status',
              value: (u) => (u.isActive ? 'Active' : 'Inactive'),
              render: (u) => (
                <span className={`pill ${u.isActive ? 'pill-SELECTED' : 'pill-REJECTED'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
              )
            },
            {
              key: 'joined',
              header: 'Joined',
              value: (u) => u.createdAt,
              render: (u) => <span className="num">{formatDate(u.createdAt)}</span>
            },
            {
              key: 'actions',
              header: 'Actions',
              render: (u) => (
                <div className="row">
                  <Button size="sm" variant="secondary" onClick={() => toggleActive(u.id, !u.isActive)}>
                    {u.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger-outline"
                    aria-label={`Delete ${u.name}`}
                    onClick={() =>
                      ask({
                        title: 'Delete user?',
                        message: `${u.name} and everything they own (profile, applications, jobs) will be permanently deleted.`,
                        confirmLabel: 'Delete',
                        run: () => deleteUser.mutateAsync(u.id),
                        done: 'User deleted.'
                      })
                    }
                  >
                    Delete
                  </Button>
                </div>
              )
            }
          ];
          return (
            <>
              <DataTable
                rows={data.users}
                columns={columns}
                rowKey={(u) => u.id}
                filterLabel="Filter users on this page"
                empty="No users"
              />
              <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
            </>
          );
        }}
      </QueryBoundary>
      {dialog}
    </Page>
  );
}

export function CompaniesPage() {
  const [page, setPage] = useState(1);
  const companies = useAdminCompanies(page);
  const { deleteCompany } = useAdminMutations();
  const { ask, dialog } = useConfirm();

  return (
    <Page title="Companies" subtitle="Company profiles created by recruiters.">
      <QueryBoundary query={companies}>
        {(data) => {
          const columns: Column<(typeof data.companies)[number]>[] = [
            {
              key: 'name',
              header: 'Company',
              value: (c) => c.name,
              render: (c) => <strong>{c.name}</strong>
            },
            { key: 'industry', header: 'Industry', value: (c) => c.industry ?? '', render: (c) => c.industry ?? '' },
            { key: 'location', header: 'Location', value: (c) => c.location ?? '', render: (c) => c.location ?? '' },
            {
              key: 'actions',
              header: 'Actions',
              render: (c) => (
                <Button
                  size="sm"
                  variant="danger-outline"
                  aria-label={`Delete ${c.name}`}
                  onClick={() =>
                    ask({
                      title: 'Delete company?',
                      message: `${c.name}, all of its jobs and their applications will be permanently deleted.`,
                      confirmLabel: 'Delete',
                      run: () => deleteCompany.mutateAsync(c.id),
                      done: 'Company deleted.'
                    })
                  }
                >
                  Delete
                </Button>
              )
            }
          ];
          return (
            <>
              <DataTable
                rows={data.companies}
                columns={columns}
                rowKey={(c) => c.id}
                filterLabel="Filter companies on this page"
                empty="No companies"
              />
              <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
            </>
          );
        }}
      </QueryBoundary>
      {dialog}
    </Page>
  );
}

export function JobsPage() {
  const [page, setPage] = useState(1);
  const jobs = useAdminJobs(page);
  const { deleteJob } = useAdminMutations();
  const { ask, dialog } = useConfirm();

  return (
    <Page title="Jobs" subtitle="All postings, open and closed.">
      <QueryBoundary query={jobs}>
        {(data) => {
          const columns: Column<(typeof data.jobs)[number]>[] = [
            { key: 'title', header: 'Title', value: (j) => j.title, render: (j) => <strong>{j.title}</strong> },
            { key: 'company', header: 'Company', value: (j) => j.company.name ?? '', render: (j) => j.company.name },
            { key: 'postedBy', header: 'Posted by', value: (j) => j.postedBy?.name ?? '', render: (j) => j.postedBy?.name },
            {
              key: 'status',
              header: 'Status',
              value: (j) => j.status,
              render: (j) => <span className={`pill pill-${j.status}`}>{j.status === 'OPEN' ? 'Open' : 'Closed'}</span>
            },
            {
              key: 'actions',
              header: 'Actions',
              render: (j) => (
                <Button
                  size="sm"
                  variant="danger-outline"
                  aria-label={`Delete ${j.title}`}
                  onClick={() =>
                    ask({
                      title: 'Delete job?',
                      message: `"${j.title}" and all of its applications will be permanently deleted.`,
                      confirmLabel: 'Delete',
                      run: () => deleteJob.mutateAsync(j.id),
                      done: 'Job deleted.'
                    })
                  }
                >
                  Delete
                </Button>
              )
            }
          ];
          return (
            <>
              <DataTable rows={data.jobs} columns={columns} rowKey={(j) => j.id} filterLabel="Filter jobs on this page" empty="No jobs" />
              <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
            </>
          );
        }}
      </QueryBoundary>
      {dialog}
    </Page>
  );
}

export function ApplicationsPage() {
  const [page, setPage] = useState(1);
  const applications = useAdminApplications(page);

  return (
    <Page title="Applications" subtitle="Every application across the platform (read only).">
      <QueryBoundary query={applications}>
        {(data) => {
          const columns: Column<(typeof data.applications)[number]>[] = [
            {
              key: 'applicant',
              header: 'Applicant',
              value: (a) => a.applicant.name ?? '',
              render: (a) => <strong>{a.applicant.name}</strong>
            },
            { key: 'job', header: 'Job', value: (a) => a.job.title ?? '', render: (a) => a.job.title },
            { key: 'company', header: 'Company', value: (a) => a.job.company.name ?? '', render: (a) => a.job.company.name },
            { key: 'status', header: 'Status', value: (a) => a.status, render: (a) => <StatusPill status={a.status} /> },
            {
              key: 'applied',
              header: 'Applied',
              value: (a) => a.appliedAt,
              render: (a) => <span className="num">{formatDate(a.appliedAt)}</span>
            }
          ];
          return (
            <>
              <DataTable
                rows={data.applications}
                columns={columns}
                rowKey={(a) => a.id}
                filterLabel="Filter applications on this page"
                empty="No applications"
              />
              <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} />
            </>
          );
        }}
      </QueryBoundary>
    </Page>
  );
}
