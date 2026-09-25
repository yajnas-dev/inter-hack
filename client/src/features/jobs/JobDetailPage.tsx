import { Link, useParams } from 'react-router-dom';
import JobDetailView from './JobDetailView';

export default function JobDetailPage() {
  const { id = '' } = useParams();
  return (
    <div className="container" style={{ maxWidth: 920 }}>
      <nav aria-label="Breadcrumb" className="muted" style={{ marginBottom: 12, fontSize: 'var(--text-sm)' }}>
        <Link to="/jobs">Jobs</Link> / <span aria-current="page">Job details</span>
      </nav>
      <JobDetailView id={id} />
    </div>
  );
}
