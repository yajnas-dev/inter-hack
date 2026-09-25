import type { Types } from 'mongoose';
import { createTtlCache } from '../infra/cache/ttl';
import { events } from '../infra/events';
import { AuthorizationError, NotFoundError, UnprocessableError } from '../http/errors';
import type { ApplicationRow } from '../repositories/application.repository';
import * as applications from '../repositories/application.repository';
import * as profiles from '../repositories/profile.repository';
import type { ResumeRow } from '../repositories/resume.repository';

/**
 * Object-level authorisation (the defence against IDOR/BOLA). Role checks happen in the router; these rules
 * decide whether THIS user may act on THIS object. Two conventions:
 *  - public objects (jobs, companies) the caller may not modify -> 403;
 *  - private objects (applications, resumes, notes) the caller may not see -> 404, so ids cannot be probed.
 */

type User = Express.AuthUser;

// A recruiter's company never changes once set, so positive lookups are cached (negative ones are not,
// so creating a company takes effect immediately).
const companyCache = createTtlCache<string>(5 * 60 * 1000, 10_000);
events.on('company.changed', ({ recruiterId }) => recruiterId && companyCache.delete(recruiterId));
export const forgetRecruiterCompany = (recruiterId: string): void => companyCache.delete(recruiterId);

export async function recruiterCompanyId(userId: string): Promise<string | null> {
  const cached = companyCache.get(userId);
  if (cached) return cached;
  const id = await profiles.companyIdOf(userId);
  if (id) companyCache.set(userId, String(id));
  return id ? String(id) : null;
}

/** The caller's company, or 422 COMPANY_REQUIRED if they have not registered one yet. */
export async function requireRecruiterCompany(user: User): Promise<string> {
  const id = await recruiterCompanyId(user.id);
  if (!id) throw new UnprocessableError('COMPANY_REQUIRED', 'Register your company profile first');
  return id;
}

/** Jobs: an admin, or a recruiter of the company that owns the job. */
export async function assertCanManageJob(user: User, job: { company: Types.ObjectId | string }): Promise<void> {
  if (user.role === 'ADMIN') return;
  if (user.role === 'RECRUITER' && (await recruiterCompanyId(user.id)) === String(job.company)) return;
  throw new AuthorizationError('You can only manage jobs that belong to your company');
}

/** Companies: a recruiter may edit only the company their profile belongs to (admins manage via /admin). */
export async function assertCanEditCompany(user: User, companyId: string): Promise<void> {
  if (user.role === 'RECRUITER' && (await recruiterCompanyId(user.id)) === companyId) return;
  throw new AuthorizationError('You can only edit your own company profile');
}

/** Applications: the applicant, a recruiter of the owning company, or an admin. Anyone else: 404. */
export async function canSeeApplication(user: User, app: Pick<ApplicationRow, 'applicant' | 'company'>): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'JOB_SEEKER') return String(app.applicant) === user.id;
  return (await recruiterCompanyId(user.id)) === String(app.company);
}

export async function assertCanSeeApplication(user: User, app: ApplicationRow | null): Promise<ApplicationRow> {
  if (!app || !(await canSeeApplication(user, app))) throw new NotFoundError('Application');
  return app;
}

/** Only the company's recruiters (or an admin) move an application through the workflow; never the applicant. */
export async function assertCanReviewApplication(user: User, app: ApplicationRow): Promise<void> {
  if (user.role === 'ADMIN') return;
  if (user.role === 'RECRUITER' && (await recruiterCompanyId(user.id)) === String(app.company)) return;
  throw new AuthorizationError('Only the hiring company can review this application');
}

/**
 * Resumes: the owner; an admin; or a recruiter of a company that received THIS resume in an application.
 * A recruiter cannot fetch a candidate's other resumes, nor any resume sent to another company.
 */
export async function assertCanReadResume(user: User, resume: ResumeRow | null): Promise<ResumeRow> {
  if (resume) {
    if (user.role === 'ADMIN' || String(resume.owner) === user.id) return resume;
    if (user.role === 'RECRUITER') {
      const companyId = await recruiterCompanyId(user.id);
      if (companyId && (await applications.resumeSentToCompany(resume._id, companyId))) return resume;
    }
  }
  throw new NotFoundError('Resume');
}
