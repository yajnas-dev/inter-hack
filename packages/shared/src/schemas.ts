import { z } from 'zod';
import {
  APPLICATION_STATUSES,
  EMPLOYMENT_TYPES,
  JOB_SORTS,
  JOB_STATUSES,
  PAGINATION,
  POSTED_WITHIN_DAYS,
  ROLES,
  SELF_REGISTER_ROLES
} from './enums';

/**
 * Request contracts, shared by the API (validation) and the client (typed calls).
 * Rules: every externally supplied value is validated here before any business logic runs; unknown body and
 * query keys are ignored (tolerant reader); invalid values are rejected (422), never silently "fixed".
 */

// ---- primitives ----------------------------------------------------------------------------

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Must be a 24-character hexadecimal id');

const text = (label: string, max: number) =>
  z
    .string({ invalid_type_error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be at most ${max} characters`);
const requiredText = (label: string, max: number) => text(label, max).min(1, `${label} is required`);

/** "" in a form or a query string means "not provided". */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const blankToNull = (v: unknown) => (v === '' ? null : v);

const optionalText = (label: string, max: number) => z.preprocess(blankToUndefined, text(label, max).optional());

/** http(s) only: a `javascript:` URL stored here would become an XSS link wherever it is rendered. */
const httpUrl = (label: string) =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .max(500, `${label} must be at most 500 characters`)
      .url(`${label} must be a valid URL`)
      .refine((u) => /^https?:\/\//i.test(u), `${label} must start with http:// or https://`)
      .optional()
  );

const intRule = (label: string, min: number, max: number) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);

/** Integer from a query string, bounded; `fallback` applies when the parameter is absent or empty. */
const queryInt = (label: string, min: number, max: number, fallback: number) =>
  z.preprocess((v) => blankToUndefined(v) ?? fallback, intRule(label, min, max));

/** Optional bounded integer from a query string. */
const optionalQueryInt = (label: string, min: number, max: number) => z.preprocess(blankToUndefined, intRule(label, min, max).optional());

const queryBool = (label: string) =>
  z.preprocess(
    blankToUndefined,
    z
      .enum(['true', 'false'], { errorMap: () => ({ message: `${label} must be true or false` }) })
      .transform((v) => v === 'true')
      .optional()
  );

/** Comma-separated list in a query string ("React,Node.js"), trimmed, de-duplicated. */
function csv<T extends z.ZodTypeAny>(item: T, label: string, maxItems: number) {
  return z.preprocess(
    (v) =>
      typeof v === 'string' && v.trim()
        ? [
            ...new Set(
              v
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          ]
        : undefined,
    z.array(item).max(maxItems, `${label} accepts at most ${maxItems} values`).optional()
  );
}

// ---- paging ---------------------------------------------------------------------------------

/** `page` is 1-based; `limit` defaults to 20 and can never exceed 100 (no unbounded result sets). */
export const paginationQuery = z.object({
  page: queryInt('page', 1, PAGINATION.maxPage, 1),
  limit: queryInt('limit', 1, PAGINATION.maxLimit, PAGINATION.defaultLimit)
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

// ---- auth & account -------------------------------------------------------------------------

const email = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(254, 'Email must be at most 254 characters')
  .email('A valid email is required');

/** UTF-8 byte length without depending on DOM or Node globals (this package runs in both). */
function utf8Length(value: string): number {
  let bytes = 0;
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** bcrypt only reads the first 72 bytes, so longer passwords are rejected rather than silently truncated. */
export const passwordRule = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .refine((p) => utf8Length(p) <= 72, 'Password must be at most 72 bytes')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'Password must contain at least one letter and one number');

export const registerBody = z.object({
  name: requiredText('Name', 100),
  email,
  password: passwordRule,
  role: z.enum(SELF_REGISTER_ROLES, { errorMap: () => ({ message: 'Role must be JOB_SEEKER or RECRUITER' }) })
});
export type RegisterBody = z.infer<typeof registerBody>;

export const loginBody = z.object({
  email,
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required').max(200)
});
export type LoginBody = z.infer<typeof loginBody>;

/** Native/mobile clients send the refresh token in the body; browsers use the httpOnly cookie instead. */
export const refreshBody = z.object({ refreshToken: z.string().min(20).max(200).optional() });
export type RefreshBody = z.infer<typeof refreshBody>;

export const updateMeBody = z.object({ name: requiredText('Name', 100) });
export type UpdateMeBody = z.infer<typeof updateMeBody>;

export const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(200),
    newPassword: passwordRule
  })
  .refine((b) => b.currentPassword !== b.newPassword, { message: 'New password must differ from the current one', path: ['newPassword'] });
export type ChangePasswordBody = z.infer<typeof changePasswordBody>;

// ---- profiles & company ---------------------------------------------------------------------

const year = (label: string) =>
  z.preprocess(blankToNull, z.coerce.number().int(`${label} must be a whole number`).min(1950).max(2100).nullish());
const date = (label: string) => z.preprocess(blankToNull, z.coerce.date({ invalid_type_error: `${label} must be a date` }).nullish());

const educationItem = z.object({
  degree: optionalText('Degree', 120),
  institution: optionalText('Institution', 160),
  fieldOfStudy: optionalText('Field of study', 120),
  startYear: year('Start year'),
  endYear: year('End year'),
  grade: optionalText('Grade', 40)
});

const experienceItem = z.object({
  title: optionalText('Title', 120),
  company: optionalText('Company', 160),
  startDate: date('Start date'),
  endDate: date('End date'),
  isCurrent: z.boolean().optional(),
  description: optionalText('Description', 2000)
});

const skillList = (max: number) =>
  z
    .array(requiredText('Skill', 60), { invalid_type_error: 'Skills must be a list' })
    .max(max, `At most ${max} skills`)
    .transform((list) => [...new Map(list.map((s) => [s.toLowerCase(), s])).values()]);

/** PATCH semantics: only the fields present are changed. */
export const seekerProfileBody = z.object({
  headline: optionalText('Headline', 160),
  phone: optionalText('Phone', 30),
  address: optionalText('Address', 300),
  dateOfBirth: date('Date of birth'),
  totalExperienceYears: z.preprocess(blankToNull, z.coerce.number().min(0).max(60).nullish()),
  education: z.array(educationItem).max(20).optional(),
  experience: z.array(experienceItem).max(30).optional(),
  skills: skillList(50).optional()
});
export type SeekerProfileBody = z.infer<typeof seekerProfileBody>;

export const recruiterProfileBody = z.object({
  designation: optionalText('Designation', 120),
  phone: optionalText('Phone', 30)
});
export type RecruiterProfileBody = z.infer<typeof recruiterProfileBody>;

export const companyBody = z.object({
  name: requiredText('Company name', 160),
  description: optionalText('Description', 4000),
  website: httpUrl('Website'),
  industry: optionalText('Industry', 120),
  location: optionalText('Location', 160),
  logoUrl: httpUrl('Logo URL')
});
export const companyUpdateBody = companyBody.partial();
export type CompanyBody = z.infer<typeof companyBody>;
export type CompanyUpdateBody = z.infer<typeof companyUpdateBody>;

// ---- jobs -----------------------------------------------------------------------------------

const money = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .min(0, `${label} must be zero or more`)
    .max(1_000_000_000);

const jobFields = {
  title: requiredText('Job title', 160),
  description: requiredText('Job description', 10_000),
  location: requiredText('Location', 160),
  salaryMin: money('salaryMin'),
  salaryMax: money('salaryMax'),
  requiredSkills: skillList(30).default([]),
  experienceRequired: z.coerce
    .number({ invalid_type_error: 'experienceRequired must be a number' })
    .min(0, 'experienceRequired must be zero or more')
    .max(60),
  employmentType: z.enum(EMPLOYMENT_TYPES, {
    errorMap: () => ({ message: `employmentType must be one of ${EMPLOYMENT_TYPES.join(', ')}` })
  }),
  vacancies: z.coerce.number().int().min(1).max(10_000).optional()
};

const salaryRange = (v: { salaryMin?: number; salaryMax?: number }) =>
  v.salaryMin === undefined || v.salaryMax === undefined || v.salaryMax >= v.salaryMin;
const salaryRangeIssue = { message: 'salaryMax must be greater than or equal to salaryMin', path: ['salaryMax'] };

/** The company is never taken from the body: a recruiter always posts under their own company. */
export const jobCreateBody = z.object(jobFields).refine(salaryRange, salaryRangeIssue);
export type JobCreateBody = z.infer<typeof jobCreateBody>;

/** PATCH: any subset of fields, plus `status` to close or reopen the vacancy. */
export const jobUpdateBody = z
  .object({
    ...jobFields,
    requiredSkills: skillList(30),
    status: z.enum(JOB_STATUSES, { errorMap: () => ({ message: 'status must be OPEN or CLOSED' }) })
  })
  .partial()
  .refine(salaryRange, salaryRangeIssue)
  .refine((b) => Object.keys(b).length > 0, 'Provide at least one field to update');
export type JobUpdateBody = z.infer<typeof jobUpdateBody>;

export const jobListQuery = paginationQuery.extend({
  /** All words must appear in the title (case-insensitive). */
  title: optionalText('title', 120),
  /** Case-insensitive prefix of the location ("chen" matches "Chennai"). */
  location: optionalText('location', 120),
  /** Jobs requiring ANY of these skills (case-insensitive exact skill names). */
  skills: csv(z.string().max(60, 'Each skill must be at most 60 characters'), 'skills', 20),
  /** The candidate's years of experience: returns jobs requiring at most this many years. */
  experience: optionalQueryInt('experience', 0, 60),
  employmentType: csv(
    z.enum(EMPLOYMENT_TYPES, { errorMap: () => ({ message: `employmentType must be one of ${EMPLOYMENT_TYPES.join(', ')}` }) }),
    'employmentType',
    EMPLOYMENT_TYPES.length
  ),
  company: z.preprocess(blankToUndefined, objectId.optional()),
  postedWithin: z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .refine((n) => (POSTED_WITHIN_DAYS as readonly number[]).includes(n), `postedWithin must be one of ${POSTED_WITHIN_DAYS.join(', ')}`)
      .optional()
  ),
  /** Jobs whose top salary is at least this much. */
  minSalary: z.preprocess(blankToUndefined, money('minSalary').optional()),
  sort: z.preprocess(
    blankToUndefined,
    z.enum(JOB_SORTS, { errorMap: () => ({ message: `sort must be one of ${JOB_SORTS.join(', ')}` }) }).default('-createdAt')
  ),
  /** Opaque keyset cursor from a previous response's `meta.nextCursor`. When present, `page` is ignored. */
  cursor: z.preprocess(blankToUndefined, z.string().max(300).optional())
});
export type JobListQuery = z.infer<typeof jobListQuery>;

/** A recruiter's own jobs (all statuses). */
export const myJobsQuery = paginationQuery.extend({
  status: z.preprocess(blankToUndefined, z.enum(JOB_STATUSES).optional())
});
export type MyJobsQuery = z.infer<typeof myJobsQuery>;

// ---- applications ---------------------------------------------------------------------------

export const applyBody = z.object({ jobId: objectId, coverNote: optionalText('Cover note', 2000) });
export type ApplyBody = z.infer<typeof applyBody>;

const applicationStatus = z.enum(APPLICATION_STATUSES, {
  errorMap: () => ({ message: `status must be one of ${APPLICATION_STATUSES.join(', ')}` })
});

export const applicationUpdateBody = z.object({ status: applicationStatus });
export type ApplicationUpdateBody = z.infer<typeof applicationUpdateBody>;

/** Caller-scoped: a seeker sees their own, a recruiter their company's, an admin everything. */
export const applicationListQuery = paginationQuery.extend({
  status: z.preprocess(blankToUndefined, applicationStatus.optional()),
  jobId: z.preprocess(blankToUndefined, objectId.optional())
});
export type ApplicationListQuery = z.infer<typeof applicationListQuery>;

/** A recruiter's private note on a candidate; never shown to the applicant. */
export const noteBody = z.object({ text: requiredText('Note', 2000) });
export type NoteBody = z.infer<typeof noteBody>;

// ---- admin ----------------------------------------------------------------------------------

const search = optionalText('q', 100);

export const adminUserListQuery = paginationQuery.extend({
  role: z.preprocess(
    blankToUndefined,
    z.enum(ROLES, { errorMap: () => ({ message: `role must be one of ${ROLES.join(', ')}` }) }).optional()
  ),
  isActive: queryBool('isActive'),
  /** Prefix of the name or email. */
  q: search
});
export type AdminUserListQuery = z.infer<typeof adminUserListQuery>;

export const adminUserUpdateBody = z.object({
  isActive: z.boolean({ required_error: 'isActive is required', invalid_type_error: 'isActive must be true or false' })
});
export type AdminUserUpdateBody = z.infer<typeof adminUserUpdateBody>;

export const adminCompanyListQuery = paginationQuery.extend({ q: search });
export type AdminCompanyListQuery = z.infer<typeof adminCompanyListQuery>;

export const adminJobListQuery = paginationQuery.extend({
  status: z.preprocess(blankToUndefined, z.enum(JOB_STATUSES).optional()),
  company: z.preprocess(blankToUndefined, objectId.optional()),
  q: search
});
export type AdminJobListQuery = z.infer<typeof adminJobListQuery>;

export const adminJobUpdateBody = z.object({
  status: z.enum(JOB_STATUSES, { errorMap: () => ({ message: 'status must be OPEN or CLOSED' }) })
});
export type AdminJobUpdateBody = z.infer<typeof adminJobUpdateBody>;

export const adminApplicationListQuery = applicationListQuery.extend({
  company: z.preprocess(blankToUndefined, objectId.optional())
});
export type AdminApplicationListQuery = z.infer<typeof adminApplicationListQuery>;

export const reportRangeQuery = z.object({ days: queryInt('days', 1, 365, 90) });

// ---- path parameters ------------------------------------------------------------------------

export const idParam = z.object({ id: objectId });
export const jobIdParam = z.object({ jobId: objectId });

// ---- notifications --------------------------------------------------------------------------

export const notificationsQuery = z.object({
  limit: queryInt('limit', 1, 50, 20),
  unreadOnly: queryBool('unreadOnly')
});

/** Marks notifications read: either `ids` or `all: true`. */
export const markReadBody = z
  .object({ ids: z.array(objectId).min(1).max(100).optional(), all: z.literal(true).optional() })
  .refine((b) => Boolean(b.ids) !== Boolean(b.all), 'Provide either ids or all: true');
export type MarkReadBody = z.infer<typeof markReadBody>;
