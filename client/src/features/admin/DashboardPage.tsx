import { QueryBoundary, Skeleton } from '../../shared/ui/Feedback';
import { RankBars, StatusBreakdown, TrendChart } from './charts';
import { useReports } from './api';

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card kpi">
      <span className="value">{value.toLocaleString()}</span>
      <span className="label">{label}</span>
      {hint && <span className="delta">{hint}</span>}
    </div>
  );
}

export default function DashboardPage() {
  const reports = useReports();
  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Platform activity at a glance.</p>
        </div>
      </div>
      <QueryBoundary query={reports} skeleton={<Skeleton height={320} />}>
        {({ summary, byStatus, overTime, topJobs, topCompanies }) => (
          <div className="stack">
            <div className="auto-grid">
              <Kpi
                label="Users"
                value={summary.totalUsers}
                hint={`${summary.totalSeekers} seekers · ${summary.totalRecruiters} recruiters`}
              />
              <Kpi label="Open jobs" value={summary.totalJobsOpen} hint={`${summary.totalJobsClosed} closed`} />
              <Kpi label="Total jobs" value={summary.totalJobs} />
              <Kpi label="Applications" value={summary.totalApplications} />
            </div>

            <section className="card" aria-labelledby="trend-title">
              <h2 id="trend-title">Applications over time</h2>
              <TrendChart data={overTime} label="Applications per day" />
            </section>

            <div className="grid-2" style={{ alignItems: 'start' }}>
              <section className="card" aria-labelledby="status-title">
                <h2 id="status-title">Applications by status</h2>
                <StatusBreakdown data={byStatus} />
              </section>
              <section className="card" aria-labelledby="companies-title">
                <h2 id="companies-title">Top companies</h2>
                <RankBars rows={topCompanies.map((c) => ({ id: c.companyId, primary: c.name, value: c.applicantCount }))} />
              </section>
            </div>

            <section className="card" aria-labelledby="jobs-title">
              <h2 id="jobs-title">Top jobs by applicants</h2>
              <RankBars rows={topJobs.map((j) => ({ id: j.jobId, primary: j.title, secondary: j.company, value: j.applicantCount }))} />
            </section>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
