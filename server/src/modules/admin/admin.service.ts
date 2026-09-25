import type { ClientSession, Types } from 'mongoose';
import type {
  AdminApplicationListQuery,
  AdminCompanyDTO,
  AdminCompanyListQuery,
  AdminJobListQuery,
  AdminUserListQuery,
  ApplicationDTO,
  JobStatus,
  ManagedJobDTO,
  UserDTO
} from '@jobportal/shared';
import { withTransaction } from '../../infra/db';
import { events } from '../../infra/events';
import { logger } from '../../infra/logger';
import { AuthorizationError, NotFoundError } from '../../http/errors';
import { forgetRecruiterCompany } from '../../policies/access';
import * as applications from '../../repositories/application.repository';
import * as companies from '../../repositories/company.repository';
import * as jobs from '../../repositories/job.repository';
import * as matches from '../../repositories/match.repository';
import * as notifications from '../../repositories/notification.repository';
import * as profiles from '../../repositories/profile.repository';
import * as resumesRepo from '../../repositories/resume.repository';
import * as saved from '../../repositories/savedJob.repository';
import * as sessions from '../../repositories/session.repository';
import * as users from '../../repositories/user.repository';
import { offsetMeta, type Paged } from '../../utils/pagination';
import { presentAdminCompany, presentApplication, presentManagedJob, presentUser } from '../../utils/presenters';
import { revokeAllSessions } from '../auth/auth.service';
import { clearReportCache } from '../reports/reports.service';
import { deleteResumesIfOrphaned, deleteAllResumesOf } from '../resumes/resumes.cleanup';

type User = Express.AuthUser;

/**
 * MongoDB has no foreign keys, so every cascade is explicit and runs in one transaction (on a replica set).
 * Resume BYTES live in GridFS, outside the transaction, and are removed only after it commits.
 */
async function deleteJobsCascade(jobIds: Types.ObjectId[], session: ClientSession | undefined): Promise<void> {
  if (!jobIds.length) return;
  await applications.deleteForJobs(jobIds, session);
  await saved.deleteForJobs(jobIds, session);
  await jobs.deleteByIds(jobIds, session);
}

function afterChange(): void {
  clearReportCache();
  events.emit('jobs.changed', {});
}

// ---- users -----------------------------------------------------------------------------------

export async function listUsers(query: AdminUserListQuery): Promise<Paged<UserDTO>> {
  const [rows, total] = await users.list(query);
  return { items: rows.map(presentUser), meta: offsetMeta(query, total) };
}

export async function getUser(id: string): Promise<UserDTO> {
  const user = await users.findById(id);
  if (!user) throw new NotFoundError('User');
  return presentUser(user);
}

/** Deactivating signs the user out everywhere immediately (refresh tokens revoked, access tokens rejected). */
export async function setUserActive(actor: User, id: string, isActive: boolean): Promise<UserDTO> {
  if (id === actor.id) throw new AuthorizationError('Administrators cannot deactivate their own account');
  const user = await users.update(id, { isActive });
  if (!user) throw new NotFoundError('User');
  if (!isActive) await revokeAllSessions(id);
  logger.info({ admin: actor.id, userId: id, isActive }, 'admin changed account state');
  clearReportCache();
  return presentUser(user);
}

export async function deleteUser(actor: User, id: string): Promise<void> {
  if (id === actor.id) throw new AuthorizationError('Administrators cannot delete their own account');
  const user = await users.findById(id);
  if (!user) throw new NotFoundError('User');

  const companyIds = await companies.idsCreatedBy(user._id);
  const jobIds = await jobs.idsWhere({ $or: [{ company: { $in: companyIds } }, { postedBy: user._id }] });
  const touchedResumes = [...(await applications.resumeIdsForApplicant(user._id)), ...(await applications.resumeIdsForJobs(jobIds))];
  await withTransaction(async (session) => {
    await deleteJobsCascade(jobIds, session);
    for (const companyId of companyIds) {
      await profiles.unsetCompany(companyId, session);
      await companies.deleteById(companyId, session);
    }
    await applications.deleteForApplicant(user._id, session);
    await Promise.all([
      profiles.deleteForUser(user._id, session),
      sessions.deleteAllForUser(user._id, session),
      saved.deleteForUser(user._id, session),
      notifications.deleteForUser(user._id, session),
      users.deleteById(id, session)
    ]);
  });

  await deleteAllResumesOf(user._id);
  await deleteResumesIfOrphaned(touchedResumes);
  await matches.deleteForCandidate(user._id);
  await matches.deleteForJobs(jobIds);
  forgetRecruiterCompany(id);
  events.emit('user.sessionsRevoked', { userId: id });
  logger.info({ admin: actor.id, userId: id }, 'admin deleted user');
  afterChange();
}

// ---- companies -------------------------------------------------------------------------------

export async function listCompanies(query: AdminCompanyListQuery): Promise<Paged<AdminCompanyDTO>> {
  const [rows, total] = await companies.list(query);
  return { items: rows.map(presentAdminCompany), meta: offsetMeta(query, total) };
}

export async function deleteCompany(actor: User, id: string): Promise<void> {
  const company = await companies.findById(id);
  if (!company) throw new NotFoundError('Company');
  const jobIds = await jobs.idsWhere({ company: company._id });
  const touchedResumes = await applications.resumeIdsForJobs(jobIds);
  await withTransaction(async (session) => {
    await deleteJobsCascade(jobIds, session);
    await profiles.unsetCompany(company._id, session);
    await companies.deleteById(company._id, session);
  });
  await deleteResumesIfOrphaned(touchedResumes);
  await matches.deleteForJobs(jobIds);
  forgetRecruiterCompany(String(company.createdBy));
  logger.info({ admin: actor.id, companyId: id, jobs: jobIds.length }, 'admin deleted company');
  afterChange();
}

// ---- jobs ------------------------------------------------------------------------------------

export async function listJobs(query: AdminJobListQuery): Promise<Paged<ManagedJobDTO>> {
  const { rows, total } = await jobs.listAll(query);
  return { items: rows.map(presentManagedJob), meta: offsetMeta(query, total) };
}

/** Moderation: close (or reopen) any job. */
export async function setJobStatus(actor: User, id: string, status: JobStatus): Promise<ManagedJobDTO> {
  const job = await jobs.setStatus(id, status);
  if (!job) throw new NotFoundError('Job');
  logger.info({ admin: actor.id, jobId: id, status }, 'admin changed job status');
  afterChange();
  return presentManagedJob({ ...job, applicantCount: await applications.countForJob(job._id) });
}

/** Unlike recruiters, admins may delete a job that has applications (e.g. fraudulent postings). */
export async function deleteJob(actor: User, id: string): Promise<void> {
  const job = await jobs.findById(id);
  if (!job) throw new NotFoundError('Job');
  const touchedResumes = await applications.resumeIdsForJobs([job._id]);
  await withTransaction((session) => deleteJobsCascade([job._id], session));
  await deleteResumesIfOrphaned(touchedResumes);
  await matches.deleteForJobs([job._id]);
  logger.info({ admin: actor.id, jobId: id }, 'admin deleted job');
  afterChange();
}

// ---- applications ----------------------------------------------------------------------------

export async function listApplications(query: AdminApplicationListQuery): Promise<Paged<ApplicationDTO>> {
  const filter = {
    ...(query.status && { status: query.status }),
    ...(query.jobId && { job: query.jobId }),
    ...(query.company && { company: query.company })
  };
  const [rows, total] = await applications.list(filter, query);
  const ids = rows.map((r) => r.resume).filter((r): r is Types.ObjectId => Boolean(r));
  const resumeMap = new Map((await resumesRepo.findManyByIds(ids)).map((r) => [String(r._id), r]));
  return { items: rows.map((a) => presentApplication(a, { reviewer: true, resumes: resumeMap })), meta: offsetMeta(query, total) };
}
