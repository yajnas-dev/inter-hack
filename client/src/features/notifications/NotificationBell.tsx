import { Link, useNavigate } from 'react-router-dom';
import { timeAgo } from '../../shared/lib/format';
import { Icon } from '../../shared/ui/Icon';
import { Menu } from '../../shared/ui/Menu';
import { useMarkRead, useNotifications, useUnreadCount } from './api';

/** Bell with an unread badge and a dropdown of the latest updates. */
export default function NotificationBell() {
  const unread = useUnreadCount().data ?? 0;
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <div style={{ position: 'relative' }}>
      <Menu iconOnly icon="bell" label="" ariaLabel={label} align="right">
        {(close) => <Panel close={close} />}
      </Menu>
      {unread > 0 && (
        <span className="badge-dot" aria-hidden="true">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </div>
  );
}

function Panel({ close }: { close: () => void }) {
  const list = useNotifications();
  const markRead = useMarkRead();
  const navigate = useNavigate();

  return (
    <div style={{ width: 340, maxWidth: '86vw' }}>
      <div className="row-between" style={{ padding: '4px 8px 8px' }}>
        <strong>Notifications</strong>
        {(list.data?.unread ?? 0) > 0 && (
          <button type="button" className="link-btn" onClick={() => markRead.mutate({ all: true })}>
            Mark all read
          </button>
        )}
      </div>
      {list.isPending && (
        <p className="muted" style={{ padding: 8 }}>
          Loading...
        </p>
      )}
      {list.data && list.data.items.length === 0 && (
        <p className="muted" style={{ padding: 8 }}>
          You're all caught up.
        </p>
      )}
      <div style={{ maxHeight: 360, overflow: 'auto' }}>
        {list.data?.items.slice(0, 8).map((n) => (
          <button
            key={n.id}
            type="button"
            className={`notif-item menu-item ${n.read ? '' : 'unread'}`}
            onClick={() => {
              if (!n.read) markRead.mutate({ ids: [n.id] });
              close();
              navigate(n.link);
            }}
          >
            {!n.read && <span className="notif-dot" aria-hidden="true" />}
            <span className="grow">
              <span style={{ display: 'block', fontWeight: 600 }}>{n.title}</span>
              <span className="muted" style={{ display: 'block' }}>
                {n.body}
              </span>
              <span className="faint" style={{ fontSize: 'var(--text-xs)' }}>
                {timeAgo(n.createdAt)}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="menu-sep" />
      <Link to="/notifications" className="menu-item" onClick={close}>
        <Icon name="right" /> View all notifications
      </Link>
    </div>
  );
}
