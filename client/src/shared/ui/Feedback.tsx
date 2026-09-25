import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { errorMessage } from '../api/http';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

export function Skeleton({
  width,
  height = 14,
  style
}: {
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
}) {
  return <div className="skeleton" aria-hidden="true" style={{ width, height, ...style }} />;
}

export function JobCardSkeleton() {
  return (
    <div className="job-card" aria-hidden="true">
      <div className="job-card-body">
        <Skeleton width={40} height={40} style={{ borderRadius: 6 }} />
        <div className="grow stack-sm">
          <Skeleton width="60%" height={16} />
          <Skeleton width="35%" />
          <Skeleton width="80%" />
        </div>
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5, card = JobCardSkeleton }: { rows?: number; card?: () => ReactNode }) {
  return (
    <div className="split-list" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <div key={i}>{card()}</div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon = 'briefcase',
  title,
  children,
  action
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="icon-wrap">
        <Icon name={icon} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="error row" role="alert">
      <span className="grow">{errorMessage(error, 'Failed to load')}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** Loading (skeleton), error (with retry) and content for a query. */
export function QueryBoundary<T>({
  query,
  skeleton,
  children
}: {
  query: UseQueryResult<T>;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <>{skeleton ?? <ListSkeleton rows={3} />}</>;
  if (query.isError) return <ErrorNote error={query.error} onRetry={() => void query.refetch()} />;
  return <>{children(query.data)}</>;
}

export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Pagination">
      <Button variant="secondary" size="sm" icon="left" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span className="num">
        Page {page} of {pages}
      </span>
      <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
        <Icon name="right" />
      </Button>
    </nav>
  );
}

/** Route-level fallback while a lazy chunk loads. */
export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="container" role="status" aria-label={label}>
      <Skeleton width="30%" height={28} />
      <div style={{ height: 16 }} />
      <Skeleton height={140} />
    </div>
  );
}
