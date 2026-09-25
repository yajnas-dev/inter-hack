import { Types } from 'mongoose';
import type {
  ApplicationDTO,
  ApplicationListQuery,
  JobCreateBody,
  JobDetailDTO,
  JobFacetsDTO,
  JobListItemDTO,
  JobListQuery,
  JobUpdateBody,
  ManagedJobDTO,
  PageMeta
} from '@jobportal/shared';
import { env } from '../../config/env';
import { createSwrCache } from '../../infra/cache/swr';
import { createTtlCache } from '../../infra/cache/ttl';
import { withTransaction } from '../../infra/db';
import { events } from '../../infra/events';
import { ConflictError, NotFoundError, ValidationError } from '../../http/errors';
import { assertCanManageJob, requireRecruiterCompany } from '../../policies/access';
import * as applications from '../../repositories/application.repository';
import * as companies from '../../repositories/company.repository';
import * as jobs from '../../repositories/job.repository';
import * as profiles from '../../repositories/profile.repository';
import * as resumes from '../../repositories/resume.repository';
import * as saved from '../../repositories/savedJob.repository';
import { offsetMeta, type Paged } from '../../utils/pagination';
import { presentApplication, presentJob, presentJobDetail, presentManagedJob } from '../../utils/presenters';

type User = Express.AuthUser;

// ---- public discovery -----------------------------------------------------------------------

// Exact totals are stale-tolerant on a job board; any job change (on any worker, via change streams) clears them.
const countCache = createTtlCache<number>(env.isTest ? 0 : 15 * 1000, 500);
events.on('jobs.changed', () => countCache.clear());

async function cachedCount(filter: Record<string, unknown>): Promise<number> {
  const key = JSON.stringify(filter);
  let total = countCache.get(key);
  if (total === undefined) {
    total = await jobs.count(filter);
    countCache.set(key, total);
  }
  return total;
}

/**
 * Public search over OPEN jobs. Filters AND together; each ordering is index-backed. Page-number requests get
 * totals; cursor requests skip the count (O(1) deep paging).
 */
export async function search(query: JobListQuery): Promise<Paged<JobListItemDTO>> {
  const filter = jobs.buildSearchFilter(query);
  const [page, total] = await Promise.all([jobs.search(query, filter), query.cursor ? undefined : cachedCount(filter)]);
  const meta: PageMeta =
    total === undefined
      ? { limit: query.limit, hasNextPage: page.hasNextPage, nextCursor: page.nextCursor }
      : { ...offsetMeta(query, total), hasNextPage: page.hasNextPage, nextCursor: page.nextCursor };
  return { items: page.rows.map(presentJob), meta };
}

export async function getJob(id: string): Promise<JobDetailDTO> {
  const job = await jobs.findDetail(id);
  if (!job) throw new NotFoundError('Job');
  return presentJobDetail(job, String(job.company?._id ?? ''));
}

export async function similar(id: string): Promise<JobListItemDTO[]> {
  const job = await jobs.findWithSkills(id);
  if (!job) throw new NotFoundError('Job');
  return (await jobs.similarTo(job)).map(presentJob);
}

const facetCache = createSwrCache<JobFacetsDTO>(env.isTest ? 0 : 5 * 60 * 1000, 2);
export const facets = (): Promise<JobFacetsDTO> => facetCache.get('facets', () => jobs.facets());

// ---- recruiter writes -----------------------------------------------------------------------

/** Posts under the caller's own company; the client never chooses the company. */
export async function createJob(user: User, body: JobCreateBody): Promise<ManagedJobDTO> {
  const companyId = await requireRecruiterCompany(user);
  const company = await companies.findById(companyId);
  if (!company) throw new NotFoundError('Company');

  const job = await jobs.create({
    ...body,
    company: company._id,
    companyName: company.name,
    companyLogoUrl: company.logoUrl,
    postedBy: new Types.ObjectId(user.id)
  });
  events.emit('jobs.changed', { jobId: String(job._id) });
  events.emit('job.created', { jobId: String(job._id), recruiterId: user.id });
  return presentManagedJob({ ...job.toObject(), applicantCount: 0 });
}

/** Partial update, including status OPEN/CLOSED. Salary bounds are re-checked against the stored values. */
export async function updateJob(user: User, id: string, body: JobUpdateBody): Promise<ManagedJobDTO> {
  const job = await jobs.findDocument(id);
  if (!job) throw new NotFoundError('Job');
  await assertCanManageJob(user, job);

  const changes = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) as JobUpdateBody;
  const salaryMin = changes.salaryMin ?? job.salaryMin;
  const salaryMax = changes.salaryMax ?? job.salaryMax;
  if (salaryMax < salaryMin) {
    throw new ValidationError([{ location: 'body', field: 'salaryMax', message: 'salaryMax must be greater than or equal to salaryMin' }]);
  }

  job.set(changes);
  const snapshotChanged = job.isModified('title') || job.isModified('location');
  await withTransaction(async (session) => {
    await job.save({ session });
    // Applications show the job's title/location from a snapshot; keep it in sync atomically.
    if (snapshotChanged) await applications.syncJobSnapshot(job._id, { jobTitle: job.title, jobLocation: job.location }, session);
  });
  events.emit('jobs.changed', { jobId: id });

  const applicantCount = await applications.countForJob(job._id);
  return presentManagedJob({ ...job.toObject(), applicantCount });
}

/**
 * Recruiters may delete only a job nobody has applied to: deleting would erase candidates' application
 * history. A job with applicants is CLOSED instead (409 tells the client so). Admins can force-delete.
 */
export async function deleteJob(user: User, id: string): Promise<void> {
  const job = await jobs.findById(id);
  if (!job) throw new NotFoundError('Job');
  await assertCanManageJob(user, job);
  if (await applications.existsForJob(job._id)) {
    throw new ConflictError(
      'This job has applications and cannot be deleted; close it instead (PATCH status=CLOSED)',
      'JOB_HAS_APPLICATIONS'
    );
  }
  await withTransaction(async (session) => {
    await saved.deleteForJobs([job._id], session);
    await jobs.deleteByIds([job._id], session);
  });
  events.emit('jobs.changed', { jobId: id });
}

// ---- applicants of a job --------------------------------------------------------------------

/**
 * The hiring company's (or an admin's) view of a job's applicants, optionally by stage. Each row includes a
 * plain skill-overlap count (applicant's listed skills vs the job's required skills).
 */
export async function listApplicants(user: User, jobId: string, query: ApplicationListQuery): Promise<Paged<ApplicationDTO>> {
  const job = await jobs.findWithSkills(jobId);
  if (!job) throw new NotFoundError('Job');
  await assertCanManageJob(user, job);

  const filter = { job: job._id, ...(query.status && { status: query.status }) };
  const [rows, total] = await applications.list(filter, query);

  const required = job.requiredSkillsLower ?? [];
  const [profileRows, resumeRows] = await Promise.all([
    required.length && rows.length ? profiles.skillsForUsers(rows.map((r) => r.applicant)) : [],
    resumes.findManyByIds(rows.map((r) => r.resume).filter((r): r is Types.ObjectId => Boolean(r)))
  ]);
  const skillsByUser = new Map(profileRows.map((p) => [String(p.user), new Set(p.skills.map((s) => s.toLowerCase()))]));
  const resumeMap = new Map(resumeRows.map((r) => [String(r._id), r]));

  const items = rows.map((a) => {
    const dto = presentApplication(a, { reviewer: true, resumes: resumeMap });
    if (!required.length) return dto;
    const has = skillsByUser.get(String(a.applicant));
    return { ...dto, matchCount: has ? required.filter((s) => has.has(s)).length : 0, matchTotal: required.length };
  });
  return { items, meta: offsetMeta(query, total) };
}
