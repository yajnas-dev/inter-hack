import type { ApplicationStatus, Role, TimeSeriesPointDTO, TopCompanyDTO, TopJobDTO } from '@jobportal/shared';
import { Application, Company, Job, User } from '../models';

type Counted<K> = { _id: K; count: number };

export const usersByRole = () =>
  User.aggregate<{ _id: Role; count: number; active: number }>([
    { $group: { _id: '$role', count: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } }
  ]);

export const jobsByStatus = () => Job.aggregate<Counted<'OPEN' | 'CLOSED'>>([{ $group: { _id: '$status', count: { $sum: 1 } } }]);

export const applicationsByStatus = () =>
  Application.aggregate<Counted<ApplicationStatus>>([{ $group: { _id: '$status', count: { $sum: 1 } } }]);

export const companyCount = () => Company.estimatedDocumentCount();

/** Daily application counts for the last `days` days (index on appliedAt bounds the scan). */
export const applicationsPerDay = (days: number) =>
  Application.aggregate<TimeSeriesPointDTO>([
    { $match: { appliedAt: { $gte: new Date(Date.now() - days * 86_400_000) } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$appliedAt' } }, count: { $sum: 1 } } },
    { $project: { _id: 0, date: '$_id', count: 1 } },
    { $sort: { date: 1 } }
  ]);

// Group first, then $limit before $lookup so only the top rows are joined.
export const topJobs = (limit = 10) =>
  Application.aggregate<TopJobDTO>([
    { $group: { _id: '$job', applicantCount: { $sum: 1 }, title: { $first: '$jobTitle' }, company: { $first: '$companyName' } } },
    { $sort: { applicantCount: -1, _id: 1 } },
    { $limit: limit },
    { $project: { _id: 0, jobId: { $toString: '$_id' }, title: 1, company: 1, applicantCount: 1 } }
  ]);

export const topCompanies = (limit = 10) =>
  Application.aggregate<TopCompanyDTO>([
    { $group: { _id: '$company', applicantCount: { $sum: 1 }, name: { $first: '$companyName' } } },
    { $sort: { applicantCount: -1, _id: 1 } },
    { $limit: limit },
    { $project: { _id: 0, companyId: { $toString: '$_id' }, name: 1, applicantCount: 1 } }
  ]);
