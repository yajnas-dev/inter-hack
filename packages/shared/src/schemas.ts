import { z } from 'zod';
import { APPLICATION_STATUSES, EMPLOYMENT_TYPES, ROLES, SELF_REGISTER_ROLES } from './enums';

// ---- primitives ----------------------------------------------------------------------------

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const trimmed = (max: number) => z.string().trim().max(max);
const requiredText = (label: string, max: number) => z.string().trim().min(1, `${label} is required`).max(max);

/** Query strings arrive as text; "" means "not provided". */
const optionalNumber = z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.number().min(0).optional());

// ---- paging ---------------------------------------------------------------------------------

/** Clamps instead of rejecting: page >= 1, 1 <= limit <= max, garbage falls back to the default. */
const pageParam = z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().catch(1)).transform((n) => Math.max(1, Math.trunc(n)));
const limitParam = (fallback: number, max: number) =>
  z
    .preprocess((v) => (v === '' || v === undefined ? fallback : v), z.coerce.number().catch(fallback))
    .transform((n) => Math.min(max, Math.max(1, Math.trunc(n))));

export const pageQuery = z.object({ page: pageParam, limit: limitParam(20, 50) });

// ---- auth -----------------------------------------------------------------------------------

export const registerBody = z.object({
  name: requiredText('Name', 100),
  email: z.string().trim().toLowerCase().email('A valid email is required').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(SELF_REGISTER_ROLES, { errorMap: () => ({ message: 'Role must be JOB_SEEKER or RECRUITER' }) })
});
export type RegisterBody = z.infer<typeof registerBody>;

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(1, 'Password is required').max(128)
});
export type LoginBody = z.infer<typeof loginBody>;

// ---- profiles & company ---------------------------------------------------------------------

const educationItem = z.object({
  degree: trimmed(120).optional(),
  institution: trimmed(160).optional(),
  fieldOfStudy: trimmed(120).optional(),
  startYear: z.coerce.number().int().min(1950).max(2100).nullish().catch(undefined),
  endYear: z.coerce.number().int().min(1950).max(2100).nullish().catch(undefined),
  grade: trimmed(40).optional()
});

const experienceItem = z.object({
  title: trimmed(120).optional(),
  company: trimmed(160).optional(),
  startDate: z.coerce.date().nullish().catch(undefined),
  endDate: z.coerce.date().nullish().catch(undefined),
  isCurrent: z.boolean().optional(),
  description: trimmed(2000).optional()
});

export const seekerProfileBody = z.object({
  headline: trimmed(160).optional(),
  phone: trimmed(30).optional(),
  address: trimmed(300).optional(),
  dateOfBirth: z.coerce.date().nullish().catch(undefined),
  education: z.array(educationItem).max(20).optional(),
  experience: z.array(experienceItem).max(30).optional(),
  skills: z.array(trimmed(60).min(1)).max(50).optional()
});
export type SeekerProfileBody = z.infer<typeof seekerProfileBody>;

export const recruiterProfileBody = z.object({
  designation: trimmed(120).optional(),
  phone: trimmed(30).optional()
});
export type RecruiterProfileBody = z.infer<typeof recruiterProfileBody>;

export const companyBody = z.object({
  name: requiredText('Company name', 160),
  description: trimmed(4000).optional(),
  website: trimmed(300).optional(),
  industry: trimmed(120).optional(),
  location: trimmed(160).optional(),
  logoUrl: trimmed(500).optional()
});
export const companyUpdateBody = companyBody.partial();
export type CompanyBody = z.infer<typeof companyBody>;

// ---- jobs -----------------------------------------------------------------------------------

const jobFields = {
  title: requiredText('Job title', 160),
  description: requiredText('Job description', 10_000),
  location: requiredText('Location', 160),
  salaryMin: z.coerce.number().min(0, 'salaryMin must be a non-negative number'),
  salaryMax: z.coerce.number().min(0, 'salaryMax must be a non-negative number'),
  requiredSkills: z.array(trimmed(60).min(1)).max(30).default([]),
  experienceRequired: z.coerce.number().min(0, 'experienceRequired must be a non-negative number').max(60),
  employmentType: z.enum(EMPLOYMENT_TYPES, {
    errorMap: () => ({ message: `employmentType must be one of ${EMPLOYMENT_TYPES.join(', ')}` })
  }),
  vacancies: z.coerce.number().int().min(1).max(10_000).optional()
};

const salaryRange = (v: { salaryMin?: number; salaryMax?: number }) =>
  v.salaryMin === undefined || v.salaryMax === undefined || v.salaryMax >= v.salaryMin;
const salaryRangeIssue = { message: 'salaryMax must be greater than or equal to salaryMin', path: ['salaryMax'] };

export const jobCreateBody = z.object({ company: objectId, ...jobFields }).refine(salaryRange, salaryRangeIssue);
export type JobCreateBody = z.infer<typeof jobCreateBody>;

export const jobUpdateBody = z.object(jobFields).partial().refine(salaryRange, salaryRangeIssue);
export type JobUpdateBody = z.infer<typeof jobUpdateBody>;

export const POSTED_WITHIN_DAYS = [1, 3, 7, 14, 30] as const;
export const JOB_SORTS = ['newest', 'salary'] as const;

/** Comma-separated employment types ("FULL_TIME,REMOTE"); unknown values are ignored rather than rejected. */
const employmentTypeList = z.preprocess(
  (v) =>
    typeof v === 'string' && v
      ? v
          .split(',')
          .map((t) => t.trim())
          .filter((t) => (EMPLOYMENT_TYPES as readonly string[]).includes(t))
      : undefined,
  z.array(z.enum(EMPLOYMENT_TYPES)).max(EMPLOYMENT_TYPES.length).optional()
);

export const jobListQuery = pageQuery.extend({
  limit: limitParam(20, 50),
  title: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  skills: z.string().trim().max(300).optional(),
  experience: optionalNumber,
  employmentType: employmentTypeList,
  company: objectId.optional().catch(undefined),
  /** Only jobs posted within this many days (1, 3, 7, 14 or 30). */
  postedWithin: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce
      .number()
      .refine((n) => (POSTED_WITHIN_DAYS as readonly number[]).includes(n))
      .optional()
      .catch(undefined)
  ),
  /** Jobs whose top salary is at least this much. */
  minSalary: optionalNumber,
  /** "newest" keeps O(1) cursor paging; "salary" pages with `page`. */
  sort: z.enum(JOB_SORTS).optional().catch('newest'),
  cursor: z.string().max(200).optional()
});
export type JobListQuery = z.infer<typeof jobListQuery>;

// ---- applications ---------------------------------------------------------------------------

export const applyBody = z.object({ jobId: objectId, coverNote: trimmed(2000).optional() });
export type ApplyBody = z.infer<typeof applyBody>;

export const statusBody = z.object({
  status: z.enum(APPLICATION_STATUSES, {
    errorMap: () => ({ message: `status must be one of ${APPLICATION_STATUSES.join(', ')}` })
  })
});

// ---- admin ----------------------------------------------------------------------------------

export const setActiveBody = z.object({ isActive: z.boolean() });
export const adminUsersQuery = pageQuery.extend({
  limit: limitParam(100, 200),
  role: z.enum(ROLES).optional().catch(undefined)
});
/** Larger default page for tables (recruiter jobs, admin lists). */
export const pagedListQuery = pageQuery.extend({
  limit: z.coerce.number().int().min(1).max(200).catch(100).default(100)
});

export const idParam = z.object({ id: objectId });
export const jobIdParam = z.object({ jobId: objectId });

// ---- notifications --------------------------------------------------------------------------

export const notificationsQuery = z.object({ limit: limitParam(20, 50) });
export const markReadBody = z.object({ ids: z.array(objectId).max(100).optional(), all: z.boolean().optional() });
export type MarkReadBody = z.infer<typeof markReadBody>;
