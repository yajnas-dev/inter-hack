export const ROLES = ['JOB_SEEKER', 'RECRUITER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** Roles a person may pick when registering. ADMIN is only ever seeded. */
export const SELF_REGISTER_ROLES = ['JOB_SEEKER', 'RECRUITER'] as const;
export type SelfRegisterRole = (typeof SELF_REGISTER_ROLES)[number];

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'REMOTE'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const JOB_STATUSES = ['OPEN', 'CLOSED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Applied -> Shortlisted -> Interview -> Selected, with Rejected reachable before Selected (see status.ts). */
export const APPLICATION_STATUSES = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/**
 * Job list orderings. A leading "-" means descending. Every ordering pages with an opaque keyset cursor
 * (`nextCursor`) or with `page`; `_id` breaks ties so paging is stable.
 */
export const JOB_SORTS = ['-createdAt', 'createdAt', '-salaryMax', 'salaryMax'] as const;
export type JobSort = (typeof JOB_SORTS)[number];

/** Only jobs posted within this many days. */
export const POSTED_WITHIN_DAYS = [1, 3, 7, 14, 30] as const;

/** Resume formats the API accepts. The type is detected from the file's bytes, never from the client. */
export const RESUME_MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword'
} as const;
export type ResumeExtension = keyof typeof RESUME_MIME_TYPES;
export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

export const PAGINATION = { defaultLimit: 20, maxLimit: 100, maxPage: 1000 } as const;

/**
 * Machine-readable error codes. Clients branch on `error.code`, never on the human message.
 * The HTTP status for each is fixed by the server (see docs/API.md, "Errors").
 */
export const ERROR_CODES = [
  // 400
  'BAD_REQUEST',
  // 401
  'UNAUTHENTICATED',
  'INVALID_TOKEN',
  'TOKEN_EXPIRED',
  'INVALID_CREDENTIALS',
  'SESSION_EXPIRED',
  'ACCOUNT_DISABLED',
  // 403
  'FORBIDDEN',
  'CSRF_CHECK_FAILED',
  // 404
  'NOT_FOUND',
  'ROUTE_NOT_FOUND',
  // 409
  'CONFLICT',
  'EMAIL_TAKEN',
  'DUPLICATE_APPLICATION',
  'INVALID_STATUS_TRANSITION',
  'JOB_CLOSED',
  'JOB_HAS_APPLICATIONS',
  'COMPANY_EXISTS',
  'CONCURRENT_UPDATE',
  // 413 / 415
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  // 422
  'VALIDATION_ERROR',
  'COMPANY_REQUIRED',
  'RESUME_REQUIRED',
  'PROFILE_INCOMPLETE',
  // 429
  'RATE_LIMITED',
  // 5xx
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE'
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Which engine produced a match analysis. "heuristic" is the deterministic fallback when AI is unavailable. */
export const MATCH_ENGINES = ['ai', 'heuristic'] as const;
export type MatchEngine = (typeof MATCH_ENGINES)[number];

export const MATCH_VERDICTS = ['STRONG', 'GOOD', 'PARTIAL', 'WEAK'] as const;
export type MatchVerdict = (typeof MATCH_VERDICTS)[number];
