import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  APPLICATION_STATUSES,
  EMPLOYMENT_TYPES,
  ERROR_CODES,
  JOB_STATUSES,
  MATCH_VERDICTS,
  ROLES,
  adminApplicationListQuery,
  adminCompanyListQuery,
  adminJobListQuery,
  adminJobUpdateBody,
  adminUserListQuery,
  adminUserUpdateBody,
  applicationListQuery,
  applicationUpdateBody,
  applyBody,
  changePasswordBody,
  companyBody,
  companyUpdateBody,
  jobCreateBody,
  jobListQuery,
  jobUpdateBody,
  loginBody,
  markReadBody,
  myJobsQuery,
  noteBody,
  notificationsQuery,
  paginationQuery,
  recruiterProfileBody,
  refreshBody,
  registerBody,
  reportRangeQuery,
  seekerProfileBody,
  updateMeBody
} from '@jobportal/shared';

type Role = (typeof ROLES)[number];
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface RouteDoc {
  method: Method;
  /** Express-style path relative to /api/v1, e.g. /jobs/:id */
  path: string;
  tag: string;
  summary: string;
  description?: string;
  /** undefined = public; otherwise the roles allowed (bearer access token required). */
  roles?: Role[];
  body?: ZodTypeAny | 'multipart';
  query?: ZodTypeAny;
  /** Success status (default 200). */
  status?: 200 | 201 | 204;
  /** Component schema of `data` ("Job", or "Job[]" for a paged collection). */
  data?: string;
  /** Status codes (beyond 401/403/422/500 which are added automatically) this endpoint can return. */
  errors?: number[];
  requirement?: string;
}

const SEEKER: Role[] = ['JOB_SEEKER'];
const RECRUITER: Role[] = ['RECRUITER'];
const REVIEWER: Role[] = ['RECRUITER', 'ADMIN'];
const ADMIN: Role[] = ['ADMIN'];
const ANY: Role[] = ['JOB_SEEKER', 'RECRUITER', 'ADMIN'];

/** The public API surface. tests/contract.test.ts fails if this and the mounted routers ever disagree. */
export const routes: RouteDoc[] = [
  // ---- health
  { method: 'get', path: '/health', tag: 'Health', summary: 'Liveness: the process is up' },
  { method: 'get', path: '/health/ready', tag: 'Health', summary: 'Readiness: the database is reachable', errors: [503] },

  // ---- auth
  {
    method: 'post',
    path: '/auth/register',
    tag: 'Auth',
    summary: 'Register a job seeker or recruiter',
    description:
      'Creates the account and its empty role profile, and starts a session. ADMIN cannot self-register. Browsers receive the refresh token as an httpOnly cookie; send `X-Token-Transport: body` to receive it in the JSON body instead (native clients).',
    body: registerBody,
    status: 201,
    data: 'AuthSession',
    errors: [409, 429],
    requirement: '1, 2'
  },
  {
    method: 'post',
    path: '/auth/login',
    tag: 'Auth',
    summary: 'Log in with email and password',
    description: 'Wrong email and wrong password give the same 401 INVALID_CREDENTIALS. Deactivated accounts get 403 ACCOUNT_DISABLED.',
    body: loginBody,
    data: 'AuthSession',
    errors: [401, 429]
  },
  {
    method: 'post',
    path: '/auth/refresh',
    tag: 'Auth',
    summary: 'Rotate the refresh token and get a new access token',
    description:
      'Uses the refresh cookie (browsers must also send `X-Requested-With`) or `{ refreshToken }` in the body. Each refresh token works once; replaying a used one revokes the whole session family.',
    body: refreshBody,
    data: 'AuthSession',
    errors: [401]
  },
  { method: 'post', path: '/auth/logout', tag: 'Auth', summary: 'Revoke the session server-side', body: refreshBody, status: 204 },

  // ---- current user
  { method: 'get', path: '/users/me', tag: 'Me', summary: 'Current account', roles: ANY, data: 'User' },
  { method: 'patch', path: '/users/me', tag: 'Me', summary: 'Rename the current account', roles: ANY, body: updateMeBody, data: 'User' },
  {
    method: 'put',
    path: '/users/me/password',
    tag: 'Me',
    summary: 'Change password (signs out every session)',
    roles: ANY,
    body: changePasswordBody,
    status: 204
  },
  {
    method: 'get',
    path: '/users/me/profile',
    tag: 'Me',
    summary: 'Role profile: seeker (personal, education, experience, skills, current resume) or recruiter (with company)',
    roles: ANY,
    data: 'Profile',
    requirement: '1, 2'
  },
  {
    method: 'patch',
    path: '/users/me/profile',
    tag: 'Me',
    summary: 'Update the role profile (partial). Body: SeekerProfileUpdate for job seekers, RecruiterProfileUpdate for recruiters.',
    roles: ['JOB_SEEKER', 'RECRUITER'],
    body: seekerProfileBody,
    data: 'Profile',
    requirement: '1'
  },
  {
    method: 'get',
    path: '/users/me/jobs',
    tag: 'Me',
    summary: "The recruiter's company jobs (all statuses) with applicant counts",
    roles: RECRUITER,
    query: myJobsQuery,
    data: 'ManagedJob[]',
    errors: [422],
    requirement: '2'
  },
  {
    method: 'get',
    path: '/users/me/dashboard',
    tag: 'Me',
    summary: 'Recruiter dashboard totals and queues',
    roles: RECRUITER,
    data: 'RecruiterDashboard'
  },
  {
    method: 'get',
    path: '/users/me/saved-jobs',
    tag: 'Me',
    summary: 'Bookmarked jobs, newest first',
    roles: SEEKER,
    query: paginationQuery,
    data: 'JobListItem[]'
  },
  { method: 'get', path: '/users/me/saved-jobs/ids', tag: 'Me', summary: 'Ids of bookmarked jobs', roles: SEEKER, data: 'IdList' },
  {
    method: 'put',
    path: '/users/me/saved-jobs/:jobId',
    tag: 'Me',
    summary: 'Bookmark a job (idempotent)',
    roles: SEEKER,
    status: 204,
    errors: [404]
  },
  {
    method: 'delete',
    path: '/users/me/saved-jobs/:jobId',
    tag: 'Me',
    summary: 'Remove a bookmark (idempotent)',
    roles: SEEKER,
    status: 204
  },

  // ---- companies
  {
    method: 'post',
    path: '/companies',
    tag: 'Companies',
    summary: "Register the recruiter's company (one per recruiter)",
    roles: RECRUITER,
    body: companyBody,
    status: 201,
    data: 'Company',
    errors: [409],
    requirement: '2'
  },
  { method: 'get', path: '/companies/:id', tag: 'Companies', summary: 'Public company profile', data: 'Company', errors: [404] },
  {
    method: 'patch',
    path: '/companies/:id',
    tag: 'Companies',
    summary: 'Edit own company (renames propagate to its jobs and applications)',
    roles: RECRUITER,
    body: companyUpdateBody,
    data: 'Company',
    errors: [404]
  },

  // ---- jobs
  {
    method: 'get',
    path: '/jobs',
    tag: 'Jobs',
    summary: 'Search open jobs',
    description:
      'Filters combine with AND: `title` (all words), `location` (prefix), `skills` (any of, comma-separated), `experience` (jobs requiring at most N years), `employmentType` (comma-separated), `minSalary`, `postedWithin`, `company`. `sort`: -createdAt (default), createdAt, -salaryMax, salaryMax. Page with `page` (returns totals) or with the opaque `cursor` from `meta.nextCursor`. `limit` ≤ 100. Responses are publicly cacheable for 10 s (ETag/304).',
    query: jobListQuery,
    data: 'JobListItem[]',
    requirement: '3, 4'
  },
  {
    method: 'get',
    path: '/jobs/facets',
    tag: 'Jobs',
    summary: 'Open-job counts by location, skill and employment type',
    data: 'JobFacets'
  },
  { method: 'get', path: '/jobs/:id', tag: 'Jobs', summary: 'Job detail with company', data: 'JobDetail', errors: [404], requirement: '3' },
  {
    method: 'get',
    path: '/jobs/:id/similar',
    tag: 'Jobs',
    summary: 'Up to 4 open jobs at the same company or sharing a skill',
    data: 'JobListItem[]',
    errors: [404]
  },
  {
    method: 'post',
    path: '/jobs',
    tag: 'Jobs',
    summary: "Create a vacancy under the recruiter's own company",
    roles: RECRUITER,
    body: jobCreateBody,
    status: 201,
    data: 'ManagedJob',
    errors: [422],
    requirement: '2'
  },
  {
    method: 'patch',
    path: '/jobs/:id',
    tag: 'Jobs',
    summary: 'Edit a vacancy of your company; `status` CLOSED/OPEN closes or reopens it',
    roles: RECRUITER,
    body: jobUpdateBody,
    data: 'ManagedJob',
    errors: [404],
    requirement: '2'
  },
  {
    method: 'delete',
    path: '/jobs/:id',
    tag: 'Jobs',
    summary: 'Delete a vacancy nobody has applied to (409 JOB_HAS_APPLICATIONS otherwise: close it instead)',
    roles: RECRUITER,
    status: 204,
    errors: [404, 409]
  },
  {
    method: 'get',
    path: '/jobs/:jobId/applications',
    tag: 'Applications',
    summary: 'Applicants of a job (the hiring company or an admin), with skill-overlap counts',
    roles: REVIEWER,
    query: applicationListQuery,
    data: 'Application[]',
    errors: [404],
    requirement: '6'
  },
  {
    method: 'post',
    path: '/jobs/:jobId/match',
    tag: 'AI',
    summary: "AI analysis of the signed-in seeker's fit for this job",
    description:
      'Compares the job with the seeker\'s profile and current resume. Uses the AI model when configured; if it is not configured, times out, is rate limited, refuses or returns unusable output, a deterministic rule-based estimate is returned instead (`engine: "heuristic"`, reason in `warnings`). Limited to AI_RATE_LIMIT_PER_HOUR calls per user.',
    roles: SEEKER,
    data: 'MatchAnalysis',
    errors: [404, 429]
  },

  // ---- applications
  {
    method: 'post',
    path: '/applications',
    tag: 'Applications',
    summary: 'Apply to an open job with the current resume',
    roles: SEEKER,
    body: applyBody,
    status: 201,
    data: 'Application',
    errors: [404, 409],
    requirement: '5'
  },
  {
    method: 'get',
    path: '/applications',
    tag: 'Applications',
    summary: "Applications visible to the caller: a seeker's own, a recruiter's company's, or all (admin)",
    roles: ANY,
    query: applicationListQuery,
    data: 'Application[]',
    requirement: '5, 6'
  },
  {
    method: 'get',
    path: '/applications/:id',
    tag: 'Applications',
    summary: 'One application with its status history (404 for anyone who may not see it)',
    roles: ANY,
    data: 'Application',
    errors: [404],
    requirement: '5'
  },
  {
    method: 'patch',
    path: '/applications/:id',
    tag: 'Applications',
    summary: 'Move an application through the workflow',
    description:
      'APPLIED → SHORTLISTED → INTERVIEW → SELECTED, and REJECTED from APPLIED, SHORTLISTED or INTERVIEW. SELECTED and REJECTED are final. Invalid moves: 409 INVALID_STATUS_TRANSITION; a concurrent change: 409 CONCURRENT_UPDATE.',
    roles: REVIEWER,
    body: applicationUpdateBody,
    data: 'Application',
    errors: [404, 409],
    requirement: '6, 7'
  },
  {
    method: 'get',
    path: '/applications/:id/applicant',
    tag: 'Applications',
    summary: "Applicant's profile (hiring company only)",
    roles: REVIEWER,
    data: 'ApplicantProfile',
    errors: [404]
  },
  {
    method: 'get',
    path: '/applications/:id/notes',
    tag: 'Applications',
    summary: 'Private recruiter notes, newest first',
    roles: REVIEWER,
    data: 'Note[]',
    errors: [404]
  },
  {
    method: 'post',
    path: '/applications/:id/notes',
    tag: 'Applications',
    summary: 'Add a private note',
    roles: REVIEWER,
    body: noteBody,
    status: 201,
    data: 'Note',
    errors: [404]
  },
  {
    method: 'post',
    path: '/applications/:id/match',
    tag: 'AI',
    summary: "AI analysis of an applicant's fit, using the resume they sent (hiring company only)",
    roles: REVIEWER,
    data: 'MatchAnalysis',
    errors: [404, 429]
  },

  // ---- resumes
  {
    method: 'post',
    path: '/resumes',
    tag: 'Resumes',
    summary: 'Upload a resume (multipart field "file": PDF, DOCX or DOC, ≤ 5 MB); it becomes the current resume',
    description:
      "The type is detected from the file's bytes and must match the extension; the client's Content-Type is ignored and the filename is sanitised. Errors: 413 too large, 415 wrong or mismatched type, 422 empty file.",
    roles: SEEKER,
    body: 'multipart',
    status: 201,
    data: 'Resume',
    errors: [400, 413, 415],
    requirement: '1'
  },
  { method: 'get', path: '/resumes', tag: 'Resumes', summary: "The seeker's own resumes", roles: SEEKER, data: 'Resume[]' },
  { method: 'get', path: '/resumes/:id', tag: 'Resumes', summary: 'Resume metadata', roles: ANY, data: 'Resume', errors: [404] },
  {
    method: 'get',
    path: '/resumes/:id/file',
    tag: 'Resumes',
    summary: 'Download the file (owner, admin, or a recruiter of a company that received it in an application)',
    description: 'Streams the file as an attachment with `Cache-Control: private, no-store`. Everyone else gets 404.',
    roles: ANY,
    errors: [404],
    requirement: '6'
  },
  {
    method: 'delete',
    path: '/resumes/:id',
    tag: 'Resumes',
    summary: 'Remove own resume (kept only for applications that used it)',
    roles: SEEKER,
    status: 204,
    errors: [404]
  },

  // ---- notifications
  {
    method: 'get',
    path: '/notifications',
    tag: 'Notifications',
    summary: 'Own notifications (meta.unread)',
    roles: ANY,
    query: notificationsQuery,
    data: 'Notification[]'
  },
  { method: 'get', path: '/notifications/unread-count', tag: 'Notifications', summary: 'Unread count', roles: ANY, data: 'UnreadCount' },
  {
    method: 'patch',
    path: '/notifications',
    tag: 'Notifications',
    summary: 'Mark notifications read: { ids } or { all: true }',
    roles: ANY,
    body: markReadBody,
    data: 'UnreadCount'
  },

  // ---- admin
  {
    method: 'get',
    path: '/admin/users',
    tag: 'Admin',
    summary: 'List users (filter by role, isActive, name/email prefix)',
    roles: ADMIN,
    query: adminUserListQuery,
    data: 'User[]',
    requirement: '8'
  },
  { method: 'get', path: '/admin/users/:id', tag: 'Admin', summary: 'One user', roles: ADMIN, data: 'User', errors: [404] },
  {
    method: 'patch',
    path: '/admin/users/:id',
    tag: 'Admin',
    summary: 'Activate or deactivate (deactivation revokes every session immediately)',
    roles: ADMIN,
    body: adminUserUpdateBody,
    data: 'User',
    errors: [404]
  },
  {
    method: 'delete',
    path: '/admin/users/:id',
    tag: 'Admin',
    summary: 'Delete a user and everything they own',
    roles: ADMIN,
    status: 204,
    errors: [404]
  },
  {
    method: 'get',
    path: '/admin/companies',
    tag: 'Admin',
    summary: 'List companies with open-job counts',
    roles: ADMIN,
    query: adminCompanyListQuery,
    data: 'AdminCompany[]'
  },
  {
    method: 'delete',
    path: '/admin/companies/:id',
    tag: 'Admin',
    summary: 'Delete a company, its jobs and their applications',
    roles: ADMIN,
    status: 204,
    errors: [404]
  },
  {
    method: 'get',
    path: '/admin/jobs',
    tag: 'Admin',
    summary: 'List all jobs (any status)',
    roles: ADMIN,
    query: adminJobListQuery,
    data: 'ManagedJob[]'
  },
  {
    method: 'patch',
    path: '/admin/jobs/:id',
    tag: 'Admin',
    summary: 'Moderate: close or reopen any job',
    roles: ADMIN,
    body: adminJobUpdateBody,
    data: 'ManagedJob',
    errors: [404]
  },
  {
    method: 'delete',
    path: '/admin/jobs/:id',
    tag: 'Admin',
    summary: 'Delete any job and its applications',
    roles: ADMIN,
    status: 204,
    errors: [404]
  },
  {
    method: 'get',
    path: '/admin/applications',
    tag: 'Admin',
    summary: 'List all applications',
    roles: ADMIN,
    query: adminApplicationListQuery,
    data: 'Application[]'
  },

  // ---- reports
  {
    method: 'get',
    path: '/reports/summary',
    tag: 'Reports',
    summary: 'Platform totals (users, companies, jobs, applications by status)',
    roles: ADMIN,
    data: 'ReportSummary',
    requirement: '8'
  },
  {
    method: 'get',
    path: '/reports/applications-over-time',
    tag: 'Reports',
    summary: 'Applications per day for the last `days` days',
    roles: ADMIN,
    query: reportRangeQuery,
    data: 'TimeSeriesPoint[]'
  },
  { method: 'get', path: '/reports/top-jobs', tag: 'Reports', summary: 'Top 10 jobs by applicants', roles: ADMIN, data: 'TopJob[]' },
  {
    method: 'get',
    path: '/reports/top-companies',
    tag: 'Reports',
    summary: 'Top 10 companies by applicants',
    roles: ADMIN,
    data: 'TopCompany[]'
  }
];

// ---- component schemas (response DTOs, mirrored from packages/shared/src/dto.ts) ------------------

const str = { type: 'string' };
const int = { type: 'integer' };
const num = { type: 'number' };
const bool = { type: 'boolean' };
const date = { type: 'string', format: 'date-time' };
const id = { type: 'string', pattern: '^[a-f0-9]{24}$' };
const arr = (items: object) => ({ type: 'array', items });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const obj = (properties: Record<string, object>, required: string[] = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required
});

const components: Record<string, object> = {
  ErrorResponse: obj({
    success: { type: 'boolean', enum: [false] },
    error: obj(
      {
        code: { type: 'string', enum: [...ERROR_CODES] },
        message: str,
        details: arr(
          obj({ location: { type: 'string', enum: ['body', 'query', 'params', 'file', 'header'] }, field: str, message: str }, ['message'])
        ),
        requestId: str
      },
      ['code', 'message']
    )
  }),
  PageMeta: obj({ page: int, limit: int, total: int, totalPages: int, hasNextPage: bool, nextCursor: { type: 'string', nullable: true } }, [
    'limit',
    'hasNextPage'
  ]),
  User: obj(
    {
      id,
      name: str,
      email: { type: 'string', format: 'email' },
      role: { type: 'string', enum: [...ROLES] },
      isActive: bool,
      createdAt: date,
      lastLoginAt: date
    },
    ['id', 'name', 'email', 'role', 'isActive', 'createdAt']
  ),
  AuthSession: obj(
    { accessToken: str, tokenType: { type: 'string', enum: ['Bearer'] }, expiresIn: int, user: ref('User'), refreshToken: str },
    ['accessToken', 'tokenType', 'expiresIn', 'user']
  ),
  Company: obj({ id, name: str, description: str, website: str, industry: str, location: str, logoUrl: str, createdAt: date }, [
    'id',
    'name'
  ]),
  AdminCompany: { allOf: [ref('Company'), obj({ createdBy: id, openJobs: int })] },
  JobListItem: obj(
    {
      id,
      title: str,
      company: obj({ id, name: str, logoUrl: str }, ['id']),
      location: str,
      salaryMin: num,
      salaryMax: num,
      requiredSkills: arr(str),
      experienceRequired: num,
      employmentType: { type: 'string', enum: [...EMPLOYMENT_TYPES] },
      status: { type: 'string', enum: [...JOB_STATUSES] },
      vacancies: int,
      createdAt: date,
      updatedAt: date
    },
    [
      'id',
      'title',
      'company',
      'location',
      'salaryMin',
      'salaryMax',
      'requiredSkills',
      'experienceRequired',
      'employmentType',
      'status',
      'createdAt'
    ]
  ),
  ManagedJob: {
    allOf: [ref('JobListItem'), obj({ applicantCount: int, postedBy: obj({ id, name: str, email: str }, ['id']) }, ['applicantCount'])]
  },
  JobDetail: { allOf: [ref('JobListItem'), obj({ description: str, company: ref('Company') })] },
  JobFacets: obj({
    locations: arr(obj({ name: str, count: int })),
    skills: arr(obj({ name: str, count: int })),
    employmentTypes: arr(obj({ name: str, count: int })),
    totalOpen: int
  }),
  Resume: obj({ id, originalName: str, mimeType: str, size: int, createdAt: date, isCurrent: bool }, [
    'id',
    'originalName',
    'mimeType',
    'size',
    'createdAt'
  ]),
  Profile: {
    description: 'SeekerProfile for JOB_SEEKER, RecruiterProfile for RECRUITER, { user, role } for ADMIN.',
    oneOf: [
      obj(
        {
          id,
          user: id,
          role: { type: 'string', enum: ['JOB_SEEKER'] },
          headline: str,
          phone: str,
          address: str,
          dateOfBirth: { ...date, nullable: true },
          totalExperienceYears: { ...num, nullable: true },
          education: arr({ type: 'object' }),
          experience: arr({ type: 'object' }),
          skills: arr(str),
          resume: { allOf: [ref('Resume')], nullable: true }
        },
        ['id', 'user', 'role', 'education', 'experience', 'skills', 'resume']
      ),
      obj(
        {
          id,
          user: id,
          role: { type: 'string', enum: ['RECRUITER'] },
          designation: str,
          phone: str,
          company: { allOf: [ref('Company')], nullable: true }
        },
        ['id', 'user', 'role', 'company']
      )
    ]
  },
  ApplicantProfile: obj(
    {
      name: str,
      email: str,
      headline: str,
      phone: str,
      skills: arr(str),
      education: arr({ type: 'object' }),
      experience: arr({ type: 'object' })
    },
    ['skills']
  ),
  Application: obj(
    {
      id,
      status: { type: 'string', enum: [...APPLICATION_STATUSES] },
      appliedAt: date,
      updatedAt: date,
      coverNote: str,
      job: obj({ id, title: str, location: str, company: obj({ id, name: str }, []) }, ['id', 'company']),
      applicant: obj({ id, name: str, email: str }, ['id']),
      resume: obj({ id, originalName: str, mimeType: str, size: int }),
      statusHistory: arr(
        obj({ status: { type: 'string', enum: [...APPLICATION_STATUSES] }, changedAt: date, changedBy: id }, ['status', 'changedAt'])
      ),
      allowedNextStatuses: arr({ type: 'string', enum: [...APPLICATION_STATUSES] }),
      matchCount: int,
      matchTotal: int,
      stageSince: date
    },
    ['id', 'status', 'appliedAt', 'job', 'applicant']
  ),
  Note: obj({ id, text: str, createdAt: date }),
  MatchAnalysis: obj(
    {
      jobId: id,
      engine: { type: 'string', enum: ['ai', 'heuristic'] },
      model: str,
      score: { type: 'integer', minimum: 0, maximum: 100 },
      verdict: { type: 'string', enum: [...MATCH_VERDICTS] },
      summary: str,
      matchedSkills: arr(str),
      missingSkills: arr(str),
      strengths: arr(str),
      gaps: arr(str),
      suggestions: arr(str),
      experience: obj({ requiredYears: num, candidateYears: { ...num, nullable: true } }),
      warnings: arr(str),
      generatedAt: date,
      cached: bool
    },
    [
      'jobId',
      'engine',
      'score',
      'verdict',
      'summary',
      'matchedSkills',
      'missingSkills',
      'strengths',
      'gaps',
      'suggestions',
      'experience',
      'warnings',
      'generatedAt',
      'cached'
    ]
  ),
  Notification: obj({ id, type: str, title: str, body: str, link: str, read: bool, createdAt: date }),
  UnreadCount: obj({ unread: int }),
  IdList: arr(id),
  RecruiterDashboard: obj({
    jobs: obj({ open: int, closed: int }),
    applicantsByStatus: { type: 'object', additionalProperties: int },
    totalApplicants: int,
    newThisWeek: int,
    recent: arr(ref('Application')),
    stale: arr(ref('Application')),
    staleCount: int
  }),
  ReportSummary: obj({
    totalUsers: int,
    totalSeekers: int,
    totalRecruiters: int,
    totalAdmins: int,
    activeUsers: int,
    totalCompanies: int,
    totalJobs: int,
    totalJobsOpen: int,
    totalJobsClosed: int,
    totalApplications: int,
    applicationsByStatus: { type: 'object', additionalProperties: int }
  }),
  TimeSeriesPoint: obj({ date: { type: 'string', format: 'date' }, count: int }),
  TopJob: obj({ jobId: id, title: str, company: str, applicantCount: int }),
  TopCompany: obj({ companyId: id, name: str, applicantCount: int })
};

// ---- examples for the most used endpoints ---------------------------------------------------------

const examples: Record<string, object> = {
  'post /auth/login': {
    success: true,
    data: {
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: '66f1c0ffee0000000000abcd',
        name: 'Sam Seeker',
        email: 'sam@example.com',
        role: 'JOB_SEEKER',
        isActive: true,
        createdAt: '2026-09-25T10:00:00.000Z'
      }
    }
  },
  'get /jobs': {
    success: true,
    data: [
      {
        id: '66f1c0ffee0000000000beef',
        title: 'Senior Backend Engineer',
        company: { id: '66f1c0ffee0000000000c0de', name: 'Northwind Labs' },
        location: 'Chennai',
        salaryMin: 1200000,
        salaryMax: 2400000,
        requiredSkills: ['Node.js', 'MongoDB'],
        experienceRequired: 5,
        employmentType: 'FULL_TIME',
        status: 'OPEN',
        createdAt: '2026-09-25T10:00:00.000Z'
      }
    ],
    meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, nextCursor: null }
  },
  'patch /applications/:id': {
    success: true,
    data: { id: '66f1c0ffee0000000000f00d', status: 'SHORTLISTED', allowedNextStatuses: ['INTERVIEW', 'REJECTED'] }
  }
};

const errorExample = {
  success: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    details: [{ location: 'body', field: 'salaryMax', message: 'salaryMax must be greater than or equal to salaryMin' }],
    requestId: '0b6f3c1e-8d7a-4c1b-9f55-2d7e9a3c1f00'
  }
};

// ---- assembly -------------------------------------------------------------------------------------

const toOpenApiPath = (p: string): string => p.replace(/:(\w+)/g, '{$1}');
const schemaOf = (schema: ZodTypeAny) => {
  const { $schema: _ignored, ...rest } = zodToJsonSchema(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
    pipeStrategy: 'input'
  }) as Record<string, unknown>;
  return rest;
};

const ERROR_TEXT: Record<number, string> = {
  400: 'Malformed request (bad JSON or multipart)',
  401: 'Missing, invalid or expired access token (UNAUTHENTICATED, INVALID_TOKEN, TOKEN_EXPIRED, ACCOUNT_DISABLED)',
  403: 'Authenticated but not allowed (FORBIDDEN): wrong role, or not your resource',
  404: 'Not found, or a private resource you may not see',
  409: 'Conflicts with the current state (see the error code)',
  413: 'Payload too large',
  415: 'Unsupported media type',
  422: 'Validation failed (VALIDATION_ERROR with field details) or a precondition is missing',
  429: 'Rate limit exceeded (Retry-After header)',
  500: 'Unexpected error (INTERNAL_ERROR); details are logged, not returned',
  503: 'Dependency unavailable'
};

function successResponse(r: RouteDoc) {
  if (r.status === 204) return { description: 'Done (no body)' };
  if (r.path === '/resumes/:id/file') {
    return { description: 'The file', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } };
  }
  const isList = r.data?.endsWith('[]');
  const dataSchema = r.data ? (isList ? arr(ref(r.data.slice(0, -2))) : ref(r.data)) : { type: 'object' };
  const schema = obj(
    { success: { type: 'boolean', enum: [true] }, data: dataSchema, ...(isList && { meta: ref('PageMeta') }), message: str },
    ['success', 'data']
  );
  const example = examples[`${r.method} ${r.path}`];
  return {
    description: r.status === 201 ? 'Created (Location header points at the new resource)' : 'Success',
    content: { 'application/json': { schema, ...(example && { example }) } }
  };
}

export function buildOpenApi(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const r of routes) {
    const path = toOpenApiPath(`/api/v1${r.path}`);
    const parameters: unknown[] = (r.path.match(/:(\w+)/g) ?? []).map((p) => ({
      name: p.slice(1),
      in: 'path',
      required: true,
      schema: id
    }));
    if (r.query) {
      const s = schemaOf(r.query) as { properties?: Record<string, { description?: string }> };
      for (const [name, schema] of Object.entries(s.properties ?? {})) parameters.push({ name, in: 'query', required: false, schema });
    }

    const errorCodes = new Set([...(r.errors ?? []), 500]);
    if (r.roles) {
      errorCodes.add(401);
      errorCodes.add(403);
    }
    if (r.body || r.query || r.path.includes(':')) errorCodes.add(422);

    const responses: Record<string, unknown> = { [String(r.status ?? 200)]: successResponse(r) };
    for (const code of [...errorCodes].sort()) {
      responses[String(code)] = {
        description: ERROR_TEXT[code] ?? 'Error',
        content: { 'application/json': { schema: ref('ErrorResponse'), ...(code === 422 && { example: errorExample }) } }
      };
    }

    let requestBody: unknown;
    if (r.body === 'multipart') {
      requestBody = {
        required: true,
        content: { 'multipart/form-data': { schema: obj({ file: { type: 'string', format: 'binary' } }) } }
      };
    } else if (r.body) {
      const bodyContent: Record<string, unknown> = { schema: schemaOf(r.body) };
      if (r.path === '/users/me/profile') {
        bodyContent.schema = { oneOf: [schemaOf(seekerProfileBody), schemaOf(recruiterProfileBody)] };
      }
      // refresh/logout bodies are optional (browsers use the cookie instead).
      requestBody = { required: r.path !== '/auth/refresh' && r.path !== '/auth/logout', content: { 'application/json': bodyContent } };
    }

    paths[path] ??= {};
    paths[path][r.method] = {
      tags: [r.tag],
      summary: r.summary,
      description: [
        r.description,
        r.roles ? `**Roles:** ${r.roles.join(', ')}.` : '**Public.**',
        r.requirement ? `Serves requirement ${r.requirement}.` : ''
      ]
        .filter(Boolean)
        .join('\n\n'),
      operationId: `${r.method}${r.path.replace(/[/:-](\w)/g, (_m, c: string) => c.toUpperCase())}`,
      ...(r.roles && { security: [{ bearerAuth: [] }], 'x-roles': r.roles }),
      ...(parameters.length && { parameters }),
      ...(requestBody !== undefined && { requestBody }),
      responses
    };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Job Portal & Recruitment Management API',
      version: '1.0.0',
      description: [
        'Versioned REST API (`/api/v1`) for job seekers, recruiters and administrators.',
        '**Envelope.** Success: `{ success: true, data, meta?, message? }`. Failure: `{ success: false, error: { code, message, details?, requestId } }`. Branch on `error.code`.',
        '**Auth.** Send `Authorization: Bearer <accessToken>` (15-minute JWT from /auth/login or /auth/register). Renew with /auth/refresh.',
        '**Paging.** `page` (1-based) and `limit` (default 20, max 100); collections return `meta`. /jobs also supports an opaque `cursor`.',
        '**Access.** Roles are checked per route (403). Private objects you may not see (applications, resumes, notes) return 404 so ids cannot be probed.'
      ].join('\n\n')
    },
    servers: [{ url: '/' }],
    tags: ['Health', 'Auth', 'Me', 'Companies', 'Jobs', 'Applications', 'Resumes', 'AI', 'Notifications', 'Admin', 'Reports'].map(
      (name) => ({ name })
    ),
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        ...components,
        SeekerProfileUpdate: schemaOf(seekerProfileBody),
        RecruiterProfileUpdate: schemaOf(recruiterProfileBody)
      }
    },
    paths
  };
}
