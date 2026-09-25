import { Types } from 'mongoose';
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type ChangePasswordBody,
  type JobListItemDTO,
  type ManagedJobDTO,
  type MyJobsQuery,
  type PaginationQuery,
  type ProfileDTO,
  type RecruiterDashboardDTO,
  type RecruiterProfileBody,
  type SeekerProfileBody,
  type UpdateMeBody,
  type UserDTO
} from '@jobportal/shared';
import { AuthenticationError, NotFoundError } from '../../http/errors';
import { requireRecruiterCompany } from '../../policies/access';
import * as applications from '../../repositories/application.repository';
import * as jobs from '../../repositories/job.repository';
import * as profiles from '../../repositories/profile.repository';
import * as resumes from '../../repositories/resume.repository';
import * as saved from '../../repositories/savedJob.repository';
import * as users from '../../repositories/user.repository';
import { comparePassword, hashPassword } from '../../utils/password';
import { offsetMeta, type Paged } from '../../utils/pagination';
import {
  presentApplication,
  presentJob,
  presentManagedJob,
  presentRecruiterProfile,
  presentSeekerProfile,
  presentUser
} from '../../utils/presenters';
import { revokeAllSessions } from '../auth/auth.service';

type User = Express.AuthUser;

// ---- account --------------------------------------------------------------------------------

export async function getMe(user: User): Promise<UserDTO> {
  const row = await users.findById(user.id);
  if (!row) throw new NotFoundError('User');
  return presentUser(row);
}

export async function updateMe(user: User, body: UpdateMeBody): Promise<UserDTO> {
  const row = await users.update(user.id, { name: body.name });
  if (!row) throw new NotFoundError('User');
  // Applications show the applicant's name from a snapshot; keep it current.
  if (row.role === 'JOB_SEEKER') await applications.syncApplicantName(user.id, row.name);
  return presentUser(row);
}

/** Requires the current password; afterwards every existing session (all devices) is signed out. */
export async function changePassword(user: User, body: ChangePasswordBody): Promise<void> {
  const hash = await users.findPasswordHash(user.id);
  if (!hash || !(await comparePassword(body.currentPassword, hash))) {
    throw new AuthenticationError('Current password is incorrect', 'INVALID_CREDENTIALS');
  }
  await users.update(user.id, { password: await hashPassword(body.newPassword) });
  await revokeAllSessions(user.id);
}

// ---- role profile ---------------------------------------------------------------------------

export async function getProfile(user: User): Promise<ProfileDTO> {
  if (user.role === 'JOB_SEEKER') {
    const profile = await profiles.getSeeker(user.id);
    return presentSeekerProfile(profile, profile.resume ? await resumes.findById(profile.resume) : null);
  }
  if (user.role === 'RECRUITER') return presentRecruiterProfile(await profiles.getRecruiter(user.id));
  return { user: user.id, role: 'ADMIN' };
}

/** PATCH semantics; the body schema is chosen by role in the controller. */
export async function updateSeekerProfile(user: User, body: SeekerProfileBody): Promise<ProfileDTO> {
  const set = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  const profile = await profiles.updateSeeker(user.id, set);
  if (!profile) throw new NotFoundError('Profile');
  return presentSeekerProfile(profile, profile.resume ? await resumes.findById(profile.resume) : null);
}

export async function updateRecruiterProfile(user: User, body: RecruiterProfileBody): Promise<ProfileDTO> {
  const set = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) as RecruiterProfileBody;
  const profile = await profiles.updateRecruiter(user.id, set);
  if (!profile) throw new NotFoundError('Profile');
  return presentRecruiterProfile(profile);
}

// ---- recruiter: own jobs & dashboard --------------------------------------------------------

/** All jobs of the recruiter's company (open and closed) with applicant counts. */
export async function myJobs(user: User, query: MyJobsQuery): Promise<Paged<ManagedJobDTO>> {
  const companyId = new Types.ObjectId(await requireRecruiterCompany(user));
  const { rows, total } = await jobs.listForCompany(companyId, query);
  return { items: rows.map(presentManagedJob), meta: offsetMeta(query, total) };
}

export async function dashboard(user: User): Promise<RecruiterDashboardDTO> {
  const companyId = new Types.ObjectId(await requireRecruiterCompany(user));
  const [open, closed, data] = await Promise.all([
    jobs.count({ company: companyId, status: 'OPEN' }),
    jobs.count({ company: companyId, status: 'CLOSED' }),
    applications.dashboard(companyId)
  ]);

  const applicantsByStatus = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
  for (const row of data.byStatus) applicantsByStatus[row._id] = row.n;

  return {
    jobs: { open, closed },
    applicantsByStatus,
    totalApplicants: Object.values(applicantsByStatus).reduce((a, b) => a + b, 0),
    newThisWeek: data.newThisWeek,
    recent: data.recent.map((a) => presentApplication(a, { reviewer: true })),
    stale: data.stale.map((a) => presentApplication(a, { reviewer: true })),
    staleCount: data.staleCount
  };
}

// ---- seeker: saved jobs ---------------------------------------------------------------------

/** Idempotent bookmark (PUT). Only existing jobs can be saved. */
export async function saveJob(user: User, jobId: string): Promise<void> {
  if (!(await jobs.findById(jobId))) throw new NotFoundError('Job');
  await saved.save(user.id, jobId);
}

export async function unsaveJob(user: User, jobId: string): Promise<void> {
  await saved.remove(user.id, jobId);
}

export const savedJobIds = (user: User): Promise<string[]> => saved.jobIdsForUser(user.id);

export async function savedJobs(user: User, paging: PaginationQuery): Promise<Paged<JobListItemDTO>> {
  const [rows, total] = await saved.pageForUser(user.id, paging);
  // One $in query for the page; order preserved; jobs deleted since are skipped.
  const found = await jobs.findManyForList(rows.map((r) => r.job));
  const byId = new Map(found.map((j) => [String(j._id), j]));
  const items = rows.map((r) => byId.get(String(r.job))).filter((j) => j !== undefined);
  return { items: items.map(presentJob), meta: offsetMeta(paging, total) };
}
