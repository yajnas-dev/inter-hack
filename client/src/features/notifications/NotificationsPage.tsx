import { Link } from 'react-router-dom';
import { timeAgo } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { EmptyState, QueryBoundary } from '../../shared/ui/Feedback';
import { useMarkRead, useNotifications } from './api';

export default function NotificationsPage() {
  const list = useNotifications();
  const markRead = useMarkRead();

  return (
    <div className="container-narrow">
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <p>Updates about your applications and applicants.</p>
        </div>
        <Button variant="secondary" size="sm" disabled={!list.data?.unread} onClick={() => markRead.mutate({ all: true })}>
          Mark all read
        </Button>
      </div>
      <QueryBoundary query={list}>
        {({ items }) =>
          items.length === 0 ? (
            <div className="card">
              <EmptyState icon="bell" title="No notifications yet">
                You'll see updates here when an application changes stage or someone applies to your job.
              </EmptyState>
            </div>
          ) : (
            <div className="card card-flush">
              {items.map((n) => (
                <Link
                  key={n.id}
                  to={n.link}
                  className={`notif-item ${n.read ? '' : 'unread'}`}
                  onClick={() => !n.read && markRead.mutate({ ids: [n.id] })}
                >
                  {!n.read && <span className="notif-dot" aria-hidden="true" />}
                  <span className="grow">
                    <strong>{n.title}</strong>
                    <span className="muted" style={{ display: 'block' }}>
                      {n.body}
                    </span>
                  </span>
                  <span className="faint num" style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                    {timeAgo(n.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          )
        }
      </QueryBoundary>
    </div>
  );
}
