import { Navigate, Route, Routes } from 'react-router-dom';
import SeekerApplicationDetailPage from '../../features/applications/SeekerApplicationDetailPage';
import SeekerJobsPage from '../../features/applications/SeekerJobsPage';
import ProfilePage from '../../features/profile/ProfilePage';
import ResumePage from '../../features/profile/ResumePage';

/** Loaded on demand: only job seekers download this chunk. */
export default function SeekerArea() {
  return (
    <Routes>
      <Route path="jobs" element={<SeekerJobsPage />} />
      <Route path="profile" element={<ProfilePage />} />
      <Route path="resume" element={<ResumePage />} />
      <Route path="applications" element={<Navigate to="/seeker/jobs" replace />} />
      <Route path="applications/:id" element={<SeekerApplicationDetailPage />} />
      <Route path="*" element={<Navigate to="/seeker/jobs" replace />} />
    </Routes>
  );
}
