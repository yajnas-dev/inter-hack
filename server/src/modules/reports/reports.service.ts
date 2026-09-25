import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type ReportSummaryDTO,
  type TimeSeriesPointDTO,
  type TopCompanyDTO,
  type TopJobDTO
} from '@jobportal/shared';
import { env } from '../../config/env';
import { createSwrCache } from '../../infra/cache/swr';
import * as reports from '../../repositories/report.repository';

// Reports tolerate a minute of staleness: concurrent misses share one computation and stale values are served
// while one refresh runs. Admin changes clear it at once.
const cache = createSwrCache<unknown>(env.isTest ? 0 : 60 * 1000, 50);
export const clearReportCache = (): void => cache.clear();

const cached = <T>(key: string, run: () => Promise<T>): Promise<T> => cache.get(key, run) as Promise<T>;

export const summary = (): Promise<ReportSummaryDTO> =>
  cached('summary', async () => {
    const [byRole, byJobStatus, byAppStatus, totalCompanies] = await Promise.all([
      reports.usersByRole(),
      reports.jobsByStatus(),
      reports.applicationsByStatus(),
      reports.companyCount()
    ]);
    const role = (r: string) => byRole.find((x) => x._id === r);
    const jobs = (s: string) => byJobStatus.find((x) => x._id === s)?.count ?? 0;
    const applicationsByStatus = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
    for (const row of byAppStatus) applicationsByStatus[row._id] = row.count;

    return {
      totalUsers: byRole.reduce((n, r) => n + r.count, 0),
      totalSeekers: role('JOB_SEEKER')?.count ?? 0,
      totalRecruiters: role('RECRUITER')?.count ?? 0,
      totalAdmins: role('ADMIN')?.count ?? 0,
      activeUsers: byRole.reduce((n, r) => n + r.active, 0),
      totalCompanies,
      totalJobs: jobs('OPEN') + jobs('CLOSED'),
      totalJobsOpen: jobs('OPEN'),
      totalJobsClosed: jobs('CLOSED'),
      totalApplications: Object.values(applicationsByStatus).reduce((a, b) => a + b, 0),
      applicationsByStatus
    };
  });

export const applicationsOverTime = (days: number): Promise<TimeSeriesPointDTO[]> =>
  cached(`overTime:${days}`, () => reports.applicationsPerDay(days));

export const topJobs = (): Promise<TopJobDTO[]> => cached('topJobs', () => reports.topJobs());
export const topCompanies = (): Promise<TopCompanyDTO[]> => cached('topCompanies', () => reports.topCompanies());
