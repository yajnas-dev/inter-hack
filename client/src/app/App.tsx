import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { LinkButton } from '../shared/ui/Button';
import HomePage from '../features/home/HomePage';
import JobDetailPage from '../features/jobs/JobDetailPage';
import JobsPage from '../features/jobs/JobsPage';
import CompanyPublicPage from '../features/companies/CompanyPublicPage';
import { RequireAuth, RequireRole } from './guards';
import Shell from './Shell';

// Public discovery ships in the main bundle; auth screens and each role's area are separate chunks.
const LoginPage = lazy(() => import('../features/auth/LoginPage'));
const RegisterPage = lazy(() => import('../features/auth/RegisterPage'));
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage'));
const SeekerArea = lazy(() => import('./areas/SeekerArea'));
const RecruiterArea = lazy(() => import('./areas/RecruiterArea'));
const AdminArea = lazy(() => import('./areas/AdminArea'));

function NotFound() {
  return (
    <div className="notfound">
      <div className="code">404</div>
      <h1>Page not found</h1>
      <p className="muted">The page you are looking for does not exist or has moved.</p>
      <LinkButton to="/">Go home</LinkButton>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="/companies/:id" element={<CompanyPublicPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>
        <Route element={<RequireRole requires="JOB_SEEKER" />}>
          <Route path="/seeker/*" element={<SeekerArea />} />
        </Route>
        <Route element={<RequireRole requires="RECRUITER" />}>
          <Route path="/recruiter/*" element={<RecruiterArea />} />
        </Route>
        <Route element={<RequireRole requires="ADMIN" />}>
          <Route path="/admin/*" element={<AdminArea />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
