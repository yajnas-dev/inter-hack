export const ROLES = ['JOB_SEEKER', 'RECRUITER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/** Roles a person may pick when registering. ADMIN is only ever seeded. */
export const SELF_REGISTER_ROLES = ['JOB_SEEKER', 'RECRUITER'] as const;
export type SelfRegisterRole = (typeof SELF_REGISTER_ROLES)[number];

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'REMOTE'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const JOB_STATUSES = ['OPEN', 'CLOSED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** FR-07: Applied -> Shortlisted -> Interview -> Selected, with Rejected reachable before Selected. */
export const APPLICATION_STATUSES = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'REJECTED'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
