import type { ClientSession, Types } from 'mongoose';
import type { AdminSummaryDTO, Role } from '@jobportal/shared';
import { env } from '../../config/env';
import { withTransaction } from '../../infra/db';
import { events } from '../../infra/events';
import { createSwrCache } from '../../infra/cache/swr';
import { deleteResumeFileIfUnreferenced } from '../../infra/gridfs';
import { badRequest, notFound } from '../../http/errors';
import { Application, Company, Job, JobSeekerProfile, Notification, RecruiterProfile, RefreshToken, SavedJob, User } from '../../models';
import { presentApplication, toUserDTO } from '../../utils/presenters';
import { withId } from '../../utils/serialize';
import { revokeAllSessions } from '../auth/auth.service';

// 60s report cache: concurrent misses share one computation and stale values are served while refreshing.
const reports = createSwrCache<unknown>(env.isTest ? 0 : 60 * 1000, 20);
const skipOf = (page: number, limit: number) => (page - 1) * limit;

// ---- cascade helpers (Mongo has no foreign keys); each takes the surrounding session ----------

async function deleteJobsCascade(filter: Record<string, unknown>, session: ClientSession | undefined): Promise<void> {
  const jobIds = await Job.find(filter)
    .session(session ?? null)
    .distinct('_id');
  await Application.deleteMany({ job: { $in: jobIds } }, { session });
  await SavedJob.deleteMany({ job: { $in: jobIds } }, { session });
  await Job.deleteMany({ _id: { $in: jobIds } }, { session });
}

async function deleteCompanyCascade(companyId: Types.ObjectId, session: ClientSession | undefined): Promise<void> {
  await deleteJobsCascade({ company: companyId }, session);
  await RecruiterProfile.updateMany({ company: companyId }, { $unset: { company: 1 } }, { session });
  await Company.deleteOne({ _id: companyId }, { session });
}

const afterDelete = () => {
  reports.clear();
  events.emit('jobs.changed', {});
};

// ---- users -----------------------------------------------------------------------------------

export async function listUsers(role: Role | undefined, page: number, limit: number) {
  const filter = role ? { role } : {};
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skipOf(page, limit)).limit(limit).lean(),
    User.countDocuments(filter)
  ]);
  return { users: users.map(toUserDTO), total, page, limit };
}

export async function setUserActive(id: string, isActive: boolean) {
  const user = await User.findByIdAndUpdate(id, { isActive }, { new: true }).lean();
  if (!user) throw notFound('User not found');
  if (!isActive) await revokeAllSessions(id);
  return toUserDTO(user);
}

export async function deleteUser(id: string, actingAdminId: string): Promise<void> {
  if (id === actingAdminId) throw badRequest('You cannot delete your own account');
  const user = await User.findById(id).select('_id').lean();
  if (!user) throw notFound('User not found');
  const profile = await JobSeekerProfile.findOne({ user: user._id }).select('resume').lean();

  await withTransaction(async (session) => {
    await deleteJobsCascade({ postedBy: user._id }, session);
    const companyIds = await Company.find({ createdBy: user._id })
      .session(session ?? null)
      .distinct('_id');
    for (const companyId of companyIds) await deleteCompanyCascade(companyId, session);
    await Application.deleteMany({ applicant: user._id }, { session });
    await Promise.all([
      JobSeekerProfile.deleteOne({ user: user._id }, { session }),
      RecruiterProfile.deleteOne({ user: user._id }, { session }),
      RefreshToken.deleteMany({ user: user._id }, { session }),
      SavedJob.deleteMany({ user: user._id }, { session }),
      Notification.deleteMany({ user: user._id }, { session }),
      User.deleteOne({ _id: user._id }, { session })
    ]);
  });

  await deleteResumeFileIfUnreferenced(profile?.resume?.fileId);
  events.emit('user.deactivated', { userId: id });
  afterDelete();
}

// ---- companies / jobs / applications ----------------------------------------------------------

export async function listCompanies(page: number, limit: number) {
  const [companies, total] = await Promise.all([
    Company.find().sort({ createdAt: -1 }).skip(skipOf(page, limit)).limit(limit).lean(),
    Company.estimatedDocumentCount()
  ]);
  return { companies: withId(companies), total, page, limit };
}

export async function deleteCompany(id: string): Promise<void> {
  const company = await Company.findById(id).select('_id').lean();
  if (!company) throw notFound('Company not found');
  await withTransaction((session) => deleteCompanyCascade(company._id, session));
  afterDelete();
}

export async function listAllJobs(page: number, limit: number) {
  const [jobs, total] = await Promise.all([
    Job.find()
      .select('-description')
      .sort({ createdAt: -1 })
      .skip(skipOf(page, limit))
      .limit(limit)
      .populate('postedBy', 'name email')
      .lean(),
    Job.estimatedDocumentCount()
  ]);
  const shaped = jobs.map(({ companyName, companyLogoUrl: _logo, ...j }) => ({ ...j, company: { _id: j.company, name: companyName } }));
  return { jobs: withId(shaped), total, page, limit };
}

export async function deleteAnyJob(id: string): Promise<void> {
  const job = await Job.findById(id).select('_id').lean();
  if (!job) throw notFound('Job not found');
  await withTransaction((session) => deleteJobsCascade({ _id: job._id }, session));
  afterDelete();
}

export async function listAllApplications(page: number, limit: number) {
  const [rows, total] = await Promise.all([
    Application.find().select('-resumeSnapshot -statusHistory').sort({ appliedAt: -1 }).skip(skipOf(page, limit)).limit(limit).lean(),
    Application.estimatedDocumentCount()
  ]);
  return { applications: rows.map((a) => presentApplication(a)), total, page, limit };
}

// ---- reports (FR-08) --------------------------------------------------------------------------

export const summary = (): Promise<AdminSummaryDTO> =>
  reports.get('summary', async () => {
    const [users, jobs, totalApplications] = await Promise.all([
      User.aggregate<{ _id: Role; count: number }>([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      Job.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Application.estimatedDocumentCount()
    ]);
    const countOf = (rows: Array<{ _id: string; count: number }>, key: string) => rows.find((r) => r._id === key)?.count ?? 0;
    const sum = (rows: Array<{ count: number }>) => rows.reduce((total, r) => total + r.count, 0);
    return {
      totalUsers: sum(users),
      totalSeekers: countOf(users, 'JOB_SEEKER'),
      totalRecruiters: countOf(users, 'RECRUITER'),
      totalJobs: sum(jobs),
      totalJobsOpen: countOf(jobs, 'OPEN'),
      totalJobsClosed: countOf(jobs, 'CLOSED'),
      totalApplications
    } satisfies AdminSummaryDTO;
  }) as Promise<AdminSummaryDTO>;

const report = (key: string, run: () => Promise<unknown[]>) => async () => ({ results: await reports.get(key, run) });

export const applicationsByStatus = report('byStatus', () =>
  Application.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $project: { _id: 0, status: '$_id', count: 1 } }])
);

export const applicationsOverTime = report('overTime', () =>
  Application.aggregate([
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$appliedAt' } }, count: { $sum: 1 } } },
    { $project: { _id: 0, date: '$_id', count: 1 } },
    { $sort: { date: 1 } }
  ])
);

// $limit runs before $lookup so only the top rows are joined.
export const topJobs = report('topJobs', () =>
  Application.aggregate([
    { $group: { _id: '$job', applicantCount: { $sum: 1 } } },
    { $sort: { applicantCount: -1 } },
    { $limit: 10 },
    { $lookup: { from: 'jobs', localField: '_id', foreignField: '_id', as: 'job' } },
    { $unwind: '$job' },
    { $lookup: { from: 'companies', localField: 'job.company', foreignField: '_id', as: 'company' } },
    { $unwind: '$company' },
    { $project: { _id: 0, jobId: { $toString: '$job._id' }, title: '$job.title', company: '$company.name', applicantCount: 1 } }
  ])
);

// Applications carry their company, so this is one grouping stage plus a 10-row lookup.
export const topCompanies = report('topCompanies', () =>
  Application.aggregate([
    { $group: { _id: '$company', applicantCount: { $sum: 1 } } },
    { $sort: { applicantCount: -1 } },
    { $limit: 10 },
    { $lookup: { from: 'companies', localField: '_id', foreignField: '_id', as: 'company' } },
    { $unwind: '$company' },
    { $project: { _id: 0, companyId: { $toString: '$company._id' }, name: '$company.name', applicantCount: 1 } }
  ])
);
