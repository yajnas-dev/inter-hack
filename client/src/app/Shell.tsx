import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '@jobportal/shared';
import NotificationBell from '../features/notifications/NotificationBell';
import { useAuth } from '../features/auth/AuthContext';
import { type ThemePreference, useTheme } from '../shared/lib/hooks';
import { Avatar } from '../shared/ui/Avatar';
import { IconButton, LinkButton } from '../shared/ui/Button';
import { CommandPalette } from '../shared/ui/CommandPalette';
import { Drawer } from '../shared/ui/Dialog';
import { Icon } from '../shared/ui/Icon';
import { PageLoading } from '../shared/ui/Feedback';
import { Menu, MenuItem } from '../shared/ui/Menu';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const NAV: Record<Role, NavItem[]> = {
  JOB_SEEKER: [
    { to: '/jobs', label: 'Find jobs' },
    { to: '/seeker/jobs', label: 'My jobs' },
    { to: '/seeker/profile', label: 'Profile' }
  ],
  RECRUITER: [
    { to: '/recruiter', label: 'Dashboard', end: true },
    { to: '/recruiter/jobs', label: 'My postings' },
    { to: '/recruiter/company', label: 'Company' },
    { to: '/jobs', label: 'Browse jobs' }
  ],
  ADMIN: [
    { to: '/admin/dashboard', label: 'Dashboard' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/companies', label: 'Companies' },
    { to: '/admin/jobs', label: 'Jobs' },
    { to: '/admin/applications', label: 'Applications' }
  ]
};
const GUEST: NavItem[] = [{ to: '/jobs', label: 'Find jobs' }];

const THEMES: Array<{ value: ThemePreference; label: string; icon: 'monitor' | 'sun' | 'moon' }> = [
  { value: 'system', label: 'System', icon: 'monitor' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' }
];

function ThemeMenu() {
  const { preference, setTheme } = useTheme();
  const current = THEMES.find((t) => t.value === preference) ?? THEMES[0]!;
  return (
    <Menu iconOnly icon={current.icon} label="" ariaLabel={`Theme: ${current.label}`} align="right">
      {(close) => (
        <>
          <div className="menu-title">Theme</div>
          {THEMES.map((t) => (
            <MenuItem
              key={t.value}
              icon={t.icon}
              selected={preference === t.value}
              onClick={() => {
                setTheme(t.value);
                close();
              }}
            >
              {t.label}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const home = user.role === 'RECRUITER' ? '/recruiter' : user.role === 'ADMIN' ? '/admin/dashboard' : '/seeker/jobs';
  return (
    <Menu iconOnly label={<Avatar name={user.name} size="sm" />} ariaLabel={`Account menu for ${user.name}`} align="right">
      {(close) => (
        <>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ fontWeight: 650 }}>{user.name}</div>
            <div className="faint" style={{ fontSize: 'var(--text-xs)' }}>
              {user.email}
            </div>
          </div>
          <div className="menu-sep" />
          <MenuItem
            icon="home"
            onClick={() => {
              close();
              navigate(home);
            }}
          >
            {user.role === 'ADMIN' ? 'Admin dashboard' : user.role === 'RECRUITER' ? 'Recruiter dashboard' : 'My jobs'}
          </MenuItem>
          {user.role === 'JOB_SEEKER' && (
            <>
              <MenuItem
                icon="user"
                onClick={() => {
                  close();
                  navigate('/seeker/profile');
                }}
              >
                Profile
              </MenuItem>
              <MenuItem
                icon="file"
                onClick={() => {
                  close();
                  navigate('/seeker/resume');
                }}
              >
                Resume
              </MenuItem>
            </>
          )}
          <MenuItem
            icon="bell"
            onClick={() => {
              close();
              navigate('/notifications');
            }}
          >
            Notifications
          </MenuItem>
          <div className="menu-sep" />
          <MenuItem
            icon="logout"
            onClick={async () => {
              close();
              await logout();
              navigate('/login');
            }}
          >
            Sign out
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

export function Header() {
  const { user, status } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const items = user ? NAV[user.role] : GUEST;
  const pathname = useLocation().pathname;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="site-header">
      <div className="inner">
        <IconButton className="menu-toggle" icon="menu" label="Open menu" onClick={() => setDrawer(true)} />
        <Link to="/" className="brand" aria-label="Job Portal home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">Job Portal</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <button
            type="button"
            className="cmdk"
            aria-haspopup="dialog"
            aria-keyshortcuts="Control+K Meta+K"
            onClick={() => setPalette(true)}
          >
            <Icon name="search" />
            <span className="cmdk-label">Search</span>
            <kbd>Ctrl K</kbd>
          </button>
          {user && <NotificationBell />}
          <ThemeMenu />
          {user ? (
            <UserMenu />
          ) : (
            status !== 'loading' && (
              <>
                <LinkButton to="/login" variant="ghost" size="sm">
                  Sign in
                </LinkButton>
                <LinkButton to="/register" size="sm">
                  Join now
                </LinkButton>
              </>
            )
          )}
        </div>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} pages={items.map((i) => ({ to: i.to, label: i.label }))} />

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Menu" side="left">
        <nav className="mobile-nav" aria-label="Mobile">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setDrawer(false)} className={pathname === i.to ? 'active' : undefined}>
              {i.label}
            </NavLink>
          ))}
          {!user && (
            <>
              <NavLink to="/login" onClick={() => setDrawer(false)}>
                Sign in
              </NavLink>
              <NavLink to="/register" onClick={() => setDrawer(false)}>
                Join now
              </NavLink>
            </>
          )}
        </nav>
      </Drawer>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="inner">
        <div className="foot-top">
          <div>
            <span className="brand">
              <span className="brand-mark" aria-hidden="true" />
              <span>Job Portal</span>
            </span>
            <p className="foot-tagline">Find the role. Track every step. Hire without the spreadsheet.</p>
          </div>
          <nav className="foot-cols" aria-label="Footer">
            <div>
              <h2 className="foot-heading">Job seekers</h2>
              <Link to="/jobs">Find jobs</Link>
              <Link to="/register">Create a profile</Link>
              <Link to="/login">Sign in</Link>
            </div>
            <div>
              <h2 className="foot-heading">Recruiters</h2>
              <Link to="/register">Start hiring</Link>
              <Link to="/recruiter/jobs/new">Post a job</Link>
              <Link to="/recruiter">Dashboard</Link>
            </div>
            <div>
              <h2 className="foot-heading">Platform</h2>
              {import.meta.env.DEV && <a href="/api/docs">API reference</a>}
              <a href="/api/health">Status</a>
            </div>
          </nav>
        </div>
        <div className="foot-bottom">
          <span>&copy; {new Date().getFullYear()} Job Portal</span>
          <span className="foot-ver">REST API &middot; MongoDB &middot; React</span>
        </div>
      </div>
    </footer>
  );
}

/** Page frame: skip link, sticky header, content outlet, footer. */
export default function Shell() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
