import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  adminUsersQuery,
  applyBody,
  companyBody,
  companyUpdateBody,
  jobCreateBody,
  jobListQuery,
  jobUpdateBody,
  loginBody,
  markReadBody,
  pagedListQuery,
  recruiterProfileBody,
  registerBody,
  seekerProfileBody,
  setActiveBody,
  statusBody
} from '@jobportal/shared';

type Role = 'JOB_SEEKER' | 'RECRUITER' | 'ADMIN';
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface RouteDoc {
  method: Method;
  /** Express-style path relative to /api, e.g. /jobs/:id */
  path: string;
  tag: string;
  summary: string;
  /** undefined = public; otherwise the roles allowed (a bearer access token is required). */
  roles?: Role[];
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  status?: number;
  /** FR-xx requirement this endpoint serves. */
  fr?: string;
}

const SEEKER: Role[] = ['JOB_SEEKER'];
const RECRUITER: Role[] = ['RECRUITER'];
const ADMIN: Role[] = ['ADMIN'];
const ANY: Role[] = ['JOB_SEEKER', 'RECRUITER', 'ADMIN'];

/** The single source of truth for the public API surface. A contract test keeps it in sync with the routers. */
export const routes: RouteDoc[] = [
  {
    method: 'post',
    path: '/auth/register',
    tag: 'Auth',
    summary: 'Register a job seeker or recruiter; returns an access token and sets the refresh cookie',
    body: registerBody,
    status: 201,
    fr: 'FR-01, FR-02'
  },
  {
    method: 'post',
    path: '/auth/login',
    tag: 'Auth',
    summary: 'Log in; returns an access token and sets the refresh cookie',
    body: loginBody,
    fr: 'FR-01, FR-02'
  },
  {
    method: 'post',
    path: '/auth/refresh',
    tag: 'Auth',
    summary: 'Rotate the refresh cookie and get a new access token (requires X-Requested-With)',
    fr: 'FR-01'
  },
  {
    method: 'post',
    path: '/auth/logout',
    tag: 'Auth',
    summary: 'Revoke the session server-side and clear the cookie (requires X-Requested-With)',
    fr: 'FR-01'
  },
  { method: 'get', path: '/auth/me', tag: 'Auth', summary: 'Current user', roles: ANY },

  { method: 'get', path: '/seekers/me', tag: 'Job seeker', summary: 'Own profile', roles: SEEKER, fr: 'FR-01' },
  {
    method: 'put',
    path: '/seekers/me',
    tag: 'Job seeker',
    summary: 'Update personal, education, experience and skills',
    roles: SEEKER,
    body: seekerProfileBody,
    fr: 'FR-01'
  },
  {
    method: 'post',
    path: '/seekers/me/resume',
    tag: 'Job seeker',
    summary: 'Upload a resume (multipart field "resume": PDF/DOC/DOCX, max 5MB)',
    roles: SEEKER,
    status: 201,
    fr: 'FR-01'
  },
  { method: 'get', path: '/seekers/me/resume', tag: 'Job seeker', summary: 'Download own resume', roles: SEEKER, fr: 'FR-01' },
  { method: 'delete', path: '/seekers/me/resume', tag: 'Job seeker', summary: 'Delete own resume', roles: SEEKER, fr: 'FR-01' },

  { method: 'get', path: '/recruiters/me', tag: 'Recruiter', summary: 'Own profile with company', roles: RECRUITER, fr: 'FR-02' },
  {
    method: 'put',
    path: '/recruiters/me',
    tag: 'Recruiter',
    summary: 'Update recruiter profile',
    roles: RECRUITER,
    body: recruiterProfileBody,
    fr: 'FR-02'
  },
  {
    method: 'post',
    path: '/companies',
    tag: 'Company',
    summary: "Create the recruiter's company profile",
    roles: RECRUITER,
    body: companyBody,
    status: 201,
    fr: 'FR-02'
  },
  { method: 'get', path: '/companies/:id', tag: 'Company', summary: 'Company profile', fr: 'FR-02, FR-03' },
  {
    method: 'put',
    path: '/companies/:id',
    tag: 'Company',
    summary: 'Update own company',
    roles: RECRUITER,
    body: companyUpdateBody,
    fr: 'FR-02'
  },

  {
    method: 'get',
    path: '/jobs',
    tag: 'Jobs',
    summary: 'Search open jobs (filters AND together; cursor or page paging). Cached briefly.',
    query: jobListQuery,
    fr: 'FR-03, FR-04'
  },
  {
    method: 'get',
    path: '/jobs/mine',
    tag: 'Jobs',
    summary: 'Jobs posted by the current recruiter',
    roles: RECRUITER,
    query: pagedListQuery,
    fr: 'FR-02'
  },
  {
    method: 'get',
    path: '/jobs/facets',
    tag: 'Jobs',
    summary: 'Open-job counts by location, skill and employment type (filter options)',
    fr: 'FR-04'
  },
  { method: 'get', path: '/jobs/:id', tag: 'Jobs', summary: 'Job detail', fr: 'FR-03' },
  {
    method: 'get',
    path: '/jobs/:id/similar',
    tag: 'Jobs',
    summary: 'Up to 4 open jobs at the same company or sharing a skill (rule-based)',
    fr: 'FR-03'
  },
  {
    method: 'get',
    path: '/seekers/me/saved',
    tag: 'Saved jobs',
    summary: 'Bookmarked jobs, newest first',
    roles: SEEKER,
    query: pagedListQuery,
    fr: 'FR-03'
  },
  {
    method: 'get',
    path: '/seekers/me/saved/ids',
    tag: 'Saved jobs',
    summary: 'Ids of bookmarked jobs (to mark hearts on cached lists)',
    roles: SEEKER,
    fr: 'FR-03'
  },
  {
    method: 'put',
    path: '/seekers/me/saved/:jobId',
    tag: 'Saved jobs',
    summary: 'Bookmark a job (idempotent)',
    roles: SEEKER,
    fr: 'FR-03'
  },
  { method: 'delete', path: '/seekers/me/saved/:jobId', tag: 'Saved jobs', summary: 'Remove a bookmark', roles: SEEKER, fr: 'FR-03' },
  {
    method: 'get',
    path: '/recruiters/me/overview',
    tag: 'Recruiter',
    summary: 'Dashboard totals: jobs, applicants by stage, new this week, recent applicants',
    roles: RECRUITER,
    fr: 'FR-06'
  },
  {
    method: 'get',
    path: '/applications/:id/applicant',
    tag: 'Applications',
    summary: "Applicant's profile (owning recruiter only)",
    roles: RECRUITER,
    fr: 'FR-06'
  },
  { method: 'get', path: '/notifications', tag: 'Notifications', summary: 'In-app notifications and unread count', roles: ANY, fr: 'NFR' },
  { method: 'get', path: '/notifications/unread-count', tag: 'Notifications', summary: 'Unread notification count', roles: ANY, fr: 'NFR' },
  {
    method: 'post',
    path: '/notifications/read',
    tag: 'Notifications',
    summary: 'Mark notifications read (ids or all)',
    roles: ANY,
    body: markReadBody,
    fr: 'NFR'
  },
  {
    method: 'post',
    path: '/jobs',
    tag: 'Jobs',
    summary: "Create a vacancy under the recruiter's company",
    roles: RECRUITER,
    body: jobCreateBody,
    status: 201,
    fr: 'FR-02'
  },
  { method: 'put', path: '/jobs/:id', tag: 'Jobs', summary: 'Edit own vacancy', roles: RECRUITER, body: jobUpdateBody, fr: 'FR-02' },
  { method: 'delete', path: '/jobs/:id', tag: 'Jobs', summary: 'Delete own vacancy (and its applications)', roles: RECRUITER, fr: 'FR-02' },
  { method: 'patch', path: '/jobs/:id/close', tag: 'Jobs', summary: 'Close own vacancy', roles: RECRUITER, fr: 'FR-02' },
  {
    method: 'get',
    path: '/jobs/:jobId/applications',
    tag: 'Applications',
    summary: 'Applicants of own vacancy',
    roles: RECRUITER,
    fr: 'FR-06'
  },

  {
    method: 'post',
    path: '/applications',
    tag: 'Applications',
    summary: 'Apply to a job (409 if already applied)',
    roles: SEEKER,
    body: applyBody,
    status: 201,
    fr: 'FR-05'
  },
  {
    method: 'get',
    path: '/applications/mine',
    tag: 'Applications',
    summary: 'Own applications with current status',
    roles: SEEKER,
    fr: 'FR-05'
  },
  {
    method: 'get',
    path: '/applications/:id',
    tag: 'Applications',
    summary: 'One application with status history (applicant or owning recruiter)',
    roles: ['JOB_SEEKER', 'RECRUITER'],
    fr: 'FR-05, FR-06'
  },
  {
    method: 'get',
    path: '/applications/:id/resume',
    tag: 'Applications',
    summary: 'Download the resume submitted with an application',
    roles: RECRUITER,
    fr: 'FR-06'
  },
  {
    method: 'patch',
    path: '/applications/:id/status',
    tag: 'Applications',
    summary: 'Move an application along APPLIED -> SHORTLISTED -> INTERVIEW -> SELECTED (or REJECTED)',
    roles: RECRUITER,
    body: statusBody,
    fr: 'FR-06, FR-07'
  },

  { method: 'get', path: '/admin/users', tag: 'Admin', summary: 'List users', roles: ADMIN, query: adminUsersQuery, fr: 'FR-08' },
  {
    method: 'patch',
    path: '/admin/users/:id/status',
    tag: 'Admin',
    summary: 'Activate or deactivate a user (revokes sessions)',
    roles: ADMIN,
    body: setActiveBody,
    fr: 'FR-08'
  },
  { method: 'delete', path: '/admin/users/:id', tag: 'Admin', summary: 'Delete a user and everything they own', roles: ADMIN, fr: 'FR-08' },
  { method: 'get', path: '/admin/companies', tag: 'Admin', summary: 'List companies', roles: ADMIN, query: pagedListQuery, fr: 'FR-08' },
  {
    method: 'delete',
    path: '/admin/companies/:id',
    tag: 'Admin',
    summary: 'Delete a company with its jobs and applications',
    roles: ADMIN,
    fr: 'FR-08'
  },
  { method: 'get', path: '/admin/jobs', tag: 'Admin', summary: 'List all jobs', roles: ADMIN, query: pagedListQuery, fr: 'FR-08' },
  { method: 'delete', path: '/admin/jobs/:id', tag: 'Admin', summary: 'Delete a job with its applications', roles: ADMIN, fr: 'FR-08' },
  {
    method: 'get',
    path: '/admin/applications',
    tag: 'Admin',
    summary: 'List all applications',
    roles: ADMIN,
    query: pagedListQuery,
    fr: 'FR-08'
  },
  {
    method: 'get',
    path: '/admin/reports/summary',
    tag: 'Admin reports',
    summary: 'Totals (users, jobs, applications)',
    roles: ADMIN,
    fr: 'FR-08'
  },
  {
    method: 'get',
    path: '/admin/reports/applications-by-status',
    tag: 'Admin reports',
    summary: 'Applications grouped by status',
    roles: ADMIN,
    fr: 'FR-08'
  },
  {
    method: 'get',
    path: '/admin/reports/applications-over-time',
    tag: 'Admin reports',
    summary: 'Applications per day',
    roles: ADMIN,
    fr: 'FR-08'
  },
  { method: 'get', path: '/admin/reports/top-jobs', tag: 'Admin reports', summary: 'Top 10 jobs by applicants', roles: ADMIN, fr: 'FR-08' },
  {
    method: 'get',
    path: '/admin/reports/top-companies',
    tag: 'Admin reports',
    summary: 'Top 10 companies by applicants',
    roles: ADMIN,
    fr: 'FR-08'
  }
];

const toOpenApiPath = (p: string): string => p.replace(/:(\w+)/g, '{$1}');
const schemaOf = (schema: ZodTypeAny) => {
  const { $schema: _ignored, ...rest } = zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as Record<string, unknown>;
  return rest;
};

export function buildOpenApi(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const r of routes) {
    const path = toOpenApiPath(`/api${r.path}`);
    const parameters: unknown[] = [
      ...(r.path.match(/:(\w+)/g) ?? []).map((p) => ({ name: p.slice(1), in: 'path', required: true, schema: { type: 'string' } }))
    ];

    if (r.query) {
      const props = (schemaOf(r.query).properties ?? {}) as Record<string, unknown>;
      for (const [name, schema] of Object.entries(props)) parameters.push({ name, in: 'query', required: false, schema });
    }

    paths[path] = paths[path] ?? {};
    paths[path][r.method] = {
      tags: [r.tag],
      summary: r.summary,
      ...(r.fr && { description: `Serves ${r.fr}.` }),
      ...(r.roles && { security: [{ bearerAuth: [] }], 'x-roles': r.roles }),
      ...(parameters.length && { parameters }),
      ...(r.body && { requestBody: { required: true, content: { 'application/json': { schema: schemaOf(r.body) } } } }),
      responses: {
        [String(r.status ?? 200)]: { description: 'Success' },
        '400': { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        ...(r.roles && {
          '401': { description: 'Missing or expired access token' },
          '403': { description: 'Role or ownership check failed' }
        })
      }
    };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Job Portal API',
      version: '1.0.0',
      description:
        'REST API for the Job Portal & Recruitment Management System (FR-01..FR-08). Authenticate with the short-lived bearer access token returned by login/register; it is renewed through the httpOnly refresh cookie.'
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: { Error: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } }
    },
    paths
  };
}
