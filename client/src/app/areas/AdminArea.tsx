import { Navigate, Route, Routes } from 'react-router-dom';
import DashboardPage from '../../features/admin/DashboardPage';
import { ApplicationsPage, CompaniesPage, JobsPage, UsersPage } from '../../features/admin/tables';

/** Loaded on demand: only admins download this chunk. */
export default function AdminArea() {
  return (
    <Routes>
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="users" element={<UsersPage />} />
      <Route path="companies" element={<CompaniesPage />} />
      <Route path="jobs" element={<JobsPage />} />
      <Route path="applications" element={<ApplicationsPage />} />
      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes>
  );
}
