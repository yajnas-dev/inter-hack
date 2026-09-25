import type { Types, FilterQuery } from 'mongoose';
import {
  isValidTransition,
  nextStatuses,
  type ApplicantProfileDTO,
  type ApplicationDTO,
  type ApplicationListQuery,
  type ApplicationStatus,
  type ApplyBody,
  type NoteDTO
} from '@jobportal/shared';
import { events } from '../../infra/events';
import { logger } from '../../infra/logger';
import { ConflictError, NotFoundError, UnprocessableError } from '../../http/errors';
import { assertCanReviewApplication, assertCanSeeApplication, requireRecruiterCompany } from '../../policies/access';
import type { ApplicationRow } from '../../repositories/application.repository';
import * as applications from '../../repositories/application.repository';
import * as jobs from '../../repositories/job.repository';
import * as profiles from '../../repositories/profile.repository';
import * as resumes from '../../repositories/resume.repository';
import * as users from '../../repositories/user.repository';
import type { ApplicationAttrs } from '../../models';
import { offsetMeta, type Paged } from '../../utils/pagination';
import { presentApplicantProfile, presentApplication } from '../../utils/presenters';

type User = Express.AuthUser;

const isReviewer = (user: User) => user.role === 'RECRUITER' || user.role === 'ADMIN';

async function resumeMapFor(rows: ApplicationRow[]) {
  const ids = rows.map((r) => r.resume).filter((r): r is Types.ObjectId => Boolean(r));
  return new Map((await resumes.findManyByIds(ids)).map((r) => [String(r._id), r]));
}

/**
 * Apply to an OPEN job with the current resume. The unique {job, applicant} index makes a second application
 * impossible even under concurrency (-> 409 DUPLICATE_APPLICATION).
 */
export async function apply(user: User, body: ApplyBody): Promise<ApplicationDTO> {
  const [job, profile, applicant] = await Promise.all([jobs.findById(body.jobId), profiles.findSeeker(user.id), users.findById(user.id)]);
  if (!job) throw new NotFoundError('Job');
  if (job.status !== 'OPEN') throw new ConflictError('This job is no longer accepting applications', 'JOB_CLOSED');
  if (!profile?.resume) throw new UnprocessableError('RESUME_REQUIRED', 'Upload a resume before applying (POST /api/v1/resumes)');
  if (!applicant) throw new NotFoundError('User');

  const application = await applications.create({
    job: job._id,
    applicant: applicant._id,
    company: job.company,
    recruiter: job.postedBy,
    resume: profile.resume,
    applicantName: applicant.name,
    applicantEmail: applicant.email,
    jobTitle: job.title,
    jobLocation: job.location,
    companyName: job.companyName,
    coverNote: body.coverNote,
    status: 'APPLIED',
    statusHistory: [{ status: 'APPLIED', changedAt: new Date(), changedBy: applicant._id }]
  });

  events.emit('application.submitted', { applicationId: String(application._id), jobId: String(job._id), applicantId: user.id });
  return presentApplication(application, { history: true, resumes: await resumeMapFor([application]) });
}

/**
 * Caller-scoped collection: a seeker gets their own applications, a recruiter their company's, an admin all.
 * The scope is part of the query, so a filter can only narrow it, never widen it.
 */
export async function list(user: User, query: ApplicationListQuery): Promise<Paged<ApplicationDTO>> {
  const filter: FilterQuery<ApplicationAttrs> = {};
  if (user.role === 'JOB_SEEKER') filter.applicant = user.id;
  if (user.role === 'RECRUITER') filter.company = await requireRecruiterCompany(user);
  if (query.status) filter.status = query.status;
  if (query.jobId) filter.job = query.jobId;

  const [rows, total] = await applications.list(filter, query);
  const resumeMap = await resumeMapFor(rows);
  return {
    items: rows.map((a) => presentApplication(a, { reviewer: isReviewer(user), resumes: resumeMap })),
    meta: offsetMeta(query, total)
  };
}

export async function get(user: User, id: string): Promise<ApplicationDTO> {
  const app = await assertCanSeeApplication(user, await applications.findById(id));
  return presentApplication(app, { history: true, reviewer: isReviewer(user), resumes: await resumeMapFor([app]) });
}

/**
 * The workflow (packages/shared/src/status.ts):
 *   APPLIED -> SHORTLISTED -> INTERVIEW -> SELECTED, and REJECTED from any stage before SELECTED.
 * Only the hiring company (or an admin) may move an application; SELECTED and REJECTED are final.
 */
export async function updateStatus(user: User, id: string, next: ApplicationStatus): Promise<ApplicationDTO> {
  const app = await assertCanSeeApplication(user, await applications.findById(id));
  await assertCanReviewApplication(user, app);

  if (!isValidTransition(app.status, next)) {
    const allowed = nextStatuses(app.status);
    throw new ConflictError(
      `Cannot move an application from ${app.status} to ${next}. ${allowed.length ? `Allowed: ${allowed.join(', ')}` : `${app.status} is final`}`,
      'INVALID_STATUS_TRANSITION'
    );
  }

  const updated = await applications.transition(app._id, app.status, next, user.id);
  if (!updated) throw new ConflictError('The application changed in the meantime; reload and try again', 'CONCURRENT_UPDATE');

  logger.info({ applicationId: id, from: app.status, to: next, by: user.id }, 'application status changed');
  events.emit('application.statusChanged', { applicationId: id, from: app.status, to: next, changedBy: user.id });
  return presentApplication(updated, { history: true, reviewer: true, resumes: await resumeMapFor([updated]) });
}

/** The applicant's profile, for the hiring company (and admins) only. */
export async function applicantProfile(user: User, id: string): Promise<ApplicantProfileDTO> {
  const app = await assertCanSeeApplication(user, await applications.findById(id));
  await assertCanReviewApplication(user, app);
  return presentApplicantProfile(await profiles.findSeeker(app.applicant), app);
}

// ---- recruiter notes (private to the hiring company) -------------------------------------------

const presentNote = (n: { _id: unknown; text: string; createdAt: Date }): NoteDTO => ({
  id: String(n._id),
  text: n.text,
  createdAt: new Date(n.createdAt).toISOString()
});

export async function listNotes(user: User, id: string): Promise<NoteDTO[]> {
  const app = await assertCanSeeApplication(user, await applications.findById(id));
  await assertCanReviewApplication(user, app);
  return (await applications.findNotes(id)).reverse().map(presentNote);
}

export async function addNote(user: User, id: string, text: string): Promise<NoteDTO> {
  const app = await assertCanSeeApplication(user, await applications.findById(id));
  await assertCanReviewApplication(user, app);
  const note = await applications.addNote(app._id, text, user.id);
  if (!note) throw new NotFoundError('Application');
  return presentNote(note);
}

/** Used by the AI matcher: an application the caller may review, with the reviewer's company verified. */
export async function reviewableApplication(user: User, id: string): Promise<ApplicationRow> {
  const app = await assertCanSeeApplication(user, await applications.findById(id));
  await assertCanReviewApplication(user, app);
  return app;
}
