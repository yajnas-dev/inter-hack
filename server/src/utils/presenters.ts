import type { ApplicationDTO, JobListItemDTO, UserDTO } from '@jobportal/shared';
import type { ApplicationAttrs, JobAttrs, UserAttrs } from '../models';
import { withId } from './serialize';

export function toUserDTO(user: Pick<UserAttrs, '_id' | 'name' | 'email' | 'role' | 'isActive' | 'createdAt'>): UserDTO {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString()
  };
}

/** Lists read the company snapshot stored on the job (no populate); clients still receive `company`. */
export function presentJob(job: Omit<JobAttrs, 'description'> | JobAttrs): JobListItemDTO {
  const { companyName, companyLogoUrl, ...rest } = job as JobAttrs;
  return withId({ ...rest, company: { _id: job.company, name: companyName, logoUrl: companyLogoUrl } });
}

/**
 * Applications store snapshots of the related job/applicant/company so lists need no joins.
 * The API keeps its shape: nested `job` (with company) and `applicant`, and no internal file ids.
 */
export function presentApplication(app: ApplicationAttrs, opts: { includeResume?: boolean } = {}): ApplicationDTO {
  const { jobTitle, jobLocation, companyName, applicantName, applicantEmail, recruiter: _recruiter, resumeSnapshot, ...rest } = app;
  const out: Record<string, unknown> = {
    ...rest,
    job: { _id: app.job, title: jobTitle, location: jobLocation, company: { _id: app.company, name: companyName } },
    applicant: { _id: app.applicant, name: applicantName, email: applicantEmail }
  };
  if (opts.includeResume && resumeSnapshot) {
    out.resumeSnapshot = { originalName: resumeSnapshot.originalName, mimeType: resumeSnapshot.mimeType, size: resumeSnapshot.size };
  }
  return withId(out);
}
