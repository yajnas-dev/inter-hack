import { Navigate, Route, Routes } from 'react-router-dom';
import ApplicantsPage from '../../features/applications/ApplicantsPage';
import RecruiterOverviewPage from '../../features/applications/RecruiterOverviewPage';
import JobFormPage from '../../features/jobs/JobFormPage';
import MyJobsPage from '../../features/jobs/MyJobsPage';
import CompanyPage from '../../features/profile/CompanyPage';

/** Loaded on demand: only recruiters download this chunk. */
export default function RecruiterArea() {
  return (
    <Routes>
      <Route index element={<RecruiterOverviewPage />} />
      <Route path="company" element={<CompanyPage />} />
      <Route path="jobs" element={<MyJobsPage />} />
      <Route path="jobs/new" element={<JobFormPage />} />
      <Route path="jobs/:id/edit" element={<JobFormPage />} />
      <Route path="jobs/:jobId/applicants" element={<ApplicantsPage />} />
      <Route path="*" element={<Navigate to="/recruiter" replace />} />
    </Routes>
  );
}
