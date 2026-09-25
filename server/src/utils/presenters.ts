import {
  nextStatuses,
  type AdminCompanyDTO,
  type ApplicationDTO,
  type CompanyDTO,
  type EducationDTO,
  type ExperienceDTO,
  type JobDetailDTO,
  type JobListItemDTO,
  type ManagedJobDTO,
  type NotificationDTO,
  type RecruiterProfileDTO,
  type ResumeDTO,
  type SeekerProfileDTO,
  type UserDTO
} from '@jobportal/shared';
import type { Types } from 'mongoose';
import type {
  CompanyAttrs,
  EducationAttrs,
  ExperienceAttrs,
  JobAttrs,
  JobSeekerProfileAttrs,
  NotificationAttrs,
  RecruiterProfileAttrs
} from '../models';
import type { ApplicationRow } from '../repositories/application.repository';
import type { JobRow } from '../repositories/job.repository';
import type { ResumeRow } from '../repositories/resume.repository';
import type { UserRow } from '../repositories/user.repository';

/**
 * Database documents -> API DTOs. Every mapper lists its output fields explicitly (allow-list), so adding a
 * field to a model never exposes it by accident. ids become strings, dates ISO strings.
 */

const id = (v: Types.ObjectId | string | undefined | null): string => String(v ?? '');
const iso = (d: Date | undefined | null): string | undefined => (d ? new Date(d).toISOString() : undefined);

export const presentUser = (u: UserRow): UserDTO => ({
  id: id(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  isActive: u.isActive,
  createdAt: iso(u.createdAt)!,
  ...(u.lastLoginAt && { lastLoginAt: iso(u.lastLoginAt) })
});

export const presentCompany = (c: CompanyAttrs): CompanyDTO => ({
  id: id(c._id),
  name: c.name,
  description: c.description,
  website: c.website,
  industry: c.industry,
  location: c.location,
  logoUrl: c.logoUrl,
  createdAt: iso(c.createdAt)
});

export const presentAdminCompany = (c: CompanyAttrs & { openJobs: number }): AdminCompanyDTO => ({
  ...presentCompany(c),
  createdBy: id(c.createdBy),
  openJobs: c.openJobs
});

/** Lists read the company snapshot stored on the job (no join). */
export const presentJob = (j: JobRow): JobListItemDTO => ({
  id: id(j._id),
  title: j.title,
  company: { id: id(j.company), name: j.companyName, logoUrl: j.companyLogoUrl },
  location: j.location,
  salaryMin: j.salaryMin,
  salaryMax: j.salaryMax,
  requiredSkills: j.requiredSkills ?? [],
  experienceRequired: j.experienceRequired,
  employmentType: j.employmentType,
  status: j.status,
  vacancies: j.vacancies,
  createdAt: iso(j.createdAt)!,
  updatedAt: iso(j.updatedAt)
});

export const presentManagedJob = (j: Omit<JobRow, 'postedBy'> & { applicantCount: number; postedBy?: unknown }): ManagedJobDTO => {
  const poster = j.postedBy as { _id?: Types.ObjectId; name?: string; email?: string } | null | undefined;
  return {
    ...presentJob(j as JobRow),
    applicantCount: j.applicantCount,
    ...(poster && typeof poster === 'object' && poster._id && { postedBy: { id: id(poster._id), name: poster.name, email: poster.email } })
  };
};

export const presentJobDetail = (
  j: Omit<JobAttrs, 'company'> & { company: CompanyAttrs | null },
  fallbackCompanyId: string
): JobDetailDTO => {
  const { company, ...job } = j;
  const base = presentJob({ ...job, company: (company?._id ?? fallbackCompanyId) as Types.ObjectId });
  return {
    ...base,
    description: j.description,
    company: company ? presentCompany(company) : { id: fallbackCompanyId, name: j.companyName ?? 'Unknown company' }
  };
};

export const presentResume = (r: ResumeRow, currentId?: Types.ObjectId | null): ResumeDTO => ({
  id: id(r._id),
  originalName: r.originalName,
  mimeType: r.mimeType,
  size: r.size,
  createdAt: iso(r.createdAt)!,
  ...(currentId !== undefined && { isCurrent: String(currentId) === String(r._id) })
});

const presentEducation = (e: EducationAttrs): EducationDTO => ({
  degree: e.degree,
  institution: e.institution,
  fieldOfStudy: e.fieldOfStudy,
  startYear: e.startYear ?? null,
  endYear: e.endYear ?? null,
  grade: e.grade
});

const presentExperience = (e: ExperienceAttrs): ExperienceDTO => ({
  title: e.title,
  company: e.company,
  startDate: iso(e.startDate) ?? null,
  endDate: iso(e.endDate) ?? null,
  isCurrent: e.isCurrent ?? false,
  description: e.description
});

export const presentSeekerProfile = (p: JobSeekerProfileAttrs, resume: ResumeRow | null): SeekerProfileDTO => ({
  id: id(p._id),
  user: id(p.user),
  role: 'JOB_SEEKER',
  headline: p.headline,
  phone: p.phone,
  address: p.address,
  dateOfBirth: iso(p.dateOfBirth) ?? null,
  totalExperienceYears: p.totalExperienceYears ?? null,
  education: (p.education ?? []).map(presentEducation),
  experience: (p.experience ?? []).map(presentExperience),
  skills: p.skills ?? [],
  resume: resume ? presentResume(resume, p.resume) : null,
  updatedAt: iso(p.updatedAt)
});

export const presentApplicantProfile = (p: JobSeekerProfileAttrs | null, app: ApplicationRow) => ({
  name: app.applicantName,
  email: app.applicantEmail,
  headline: p?.headline,
  phone: p?.phone,
  address: p?.address,
  totalExperienceYears: p?.totalExperienceYears ?? null,
  skills: p?.skills ?? [],
  education: (p?.education ?? []).map(presentEducation),
  experience: (p?.experience ?? []).map(presentExperience)
});

export const presentRecruiterProfile = (
  p: Omit<RecruiterProfileAttrs, 'company'> & { company?: CompanyAttrs | null }
): RecruiterProfileDTO => ({
  id: id(p._id),
  user: id(p.user),
  role: 'RECRUITER',
  designation: p.designation,
  phone: p.phone,
  company: p.company ? presentCompany(p.company) : null
});

export interface PresentApplicationOptions {
  /** Full status history (single reads). Lists carry only the last entry. */
  history?: boolean;
  /** Include the statuses the reviewer may move to next. */
  reviewer?: boolean;
  resumes?: Map<string, ResumeRow>;
}

export function presentApplication(a: ApplicationRow, opts: PresentApplicationOptions = {}): ApplicationDTO {
  const last = a.statusHistory?.at(-1);
  const resume = a.resume ? opts.resumes?.get(String(a.resume)) : undefined;
  return {
    id: id(a._id),
    status: a.status,
    appliedAt: iso(a.appliedAt)!,
    updatedAt: iso(a.updatedAt),
    coverNote: a.coverNote,
    job: { id: id(a.job), title: a.jobTitle, location: a.jobLocation, company: { id: id(a.company), name: a.companyName } },
    applicant: { id: id(a.applicant), name: a.applicantName, email: a.applicantEmail },
    ...(resume && { resume: { id: id(resume._id), originalName: resume.originalName, mimeType: resume.mimeType, size: resume.size } }),
    ...(opts.history && {
      statusHistory: (a.statusHistory ?? []).map((h) => ({
        status: h.status,
        changedAt: iso(h.changedAt)!,
        ...(h.changedBy && { changedBy: id(h.changedBy) })
      }))
    }),
    ...(opts.reviewer && { allowedNextStatuses: [...nextStatuses(a.status)] }),
    stageSince: iso(last?.changedAt ?? a.appliedAt)
  };
}

export const presentNotification = (n: NotificationAttrs): NotificationDTO => ({
  id: id(n._id),
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  read: Boolean(n.readAt),
  createdAt: iso(n.createdAt)!
});
