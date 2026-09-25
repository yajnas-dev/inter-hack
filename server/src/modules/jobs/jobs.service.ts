import type { FilterQuery } from 'mongoose';
import type { JobCreateBody, JobDetailDTO, JobListDTO, JobListItemDTO, JobListQuery, JobUpdateBody } from '@jobportal/shared';
import { withTransaction } from '../../infra/db';
import { events } from '../../infra/events';
import { createTtlCache } from '../../infra/cache/ttl';
import { env } from '../../config/env';
import { badRequest, forbidden, notFound } from '../../http/errors';
import { Application, Company, Job, RecruiterProfile, SavedJob, type JobAttrs } from '../../models';
import { afterCursor, encodeCursor } from '../../utils/cursor';
import { escapeRegex } from '../../utils/escapeRegex';
import { presentJob } from '../../utils/presenters';
import { tokenize } from '../../utils/tokenize';
import { withId } from '../../utils/serialize';

// Exact totals are stale-tolerant for a job board; caching them removes an index count per request.
const countCache = createTtlCache<number>(env.isTest ? 0 : 15 * 1000, 500);
// The result count is shown on the search page, so any job change (here or on another worker) drops it at once.
events.on('jobs.changed', () => countCache.clear());
async function cachedCount(filter: FilterQuery<JobAttrs>): Promise<number> {
  const key = JSON.stringify(filter);
  let total = countCache.get(key);
  if (total === undefined) {
    total = await Job.countDocuments(filter);
    countCache.set(key, total);
  }
  return total;
}

function buildListFilter(query: JobListQuery): FilterQuery<JobAttrs> {
  const filter: FilterQuery<JobAttrs> = { status: 'OPEN' };

  if (query.title) {
    const words = tokenize(query.title);
    if (words.length) filter.titleTokens = { $all: words };
  }
  if (query.location) filter.locationLower = { $regex: `^${escapeRegex(query.location.toLowerCase())}` };
  if (query.employmentType?.length)
    filter.employmentType = query.employmentType.length === 1 ? query.employmentType[0] : { $in: query.employmentType };
  if (query.company) filter.company = query.company;
  if (query.minSalary !== undefined) filter.salaryMax = { $gte: query.minSalary };
  if (query.postedWithin) {
    // Rounded to 5 minutes so equivalent searches share cache entries.
    const now = Math.floor(Date.now() / 300_000) * 300_000;
    filter.createdAt = { $gte: new Date(now - query.postedWithin * 86_400_000) };
  }
  if (query.experience !== undefined) filter.experienceRequired = { $lte: query.experience };
  if (query.skills) {
    const skills = query.skills
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (skills.length) filter.requiredSkillsLower = { $in: skills };
  }
  return filter;
}

/**
 * Public search. Filters AND together and every plan is index-ordered (newest first). `cursor` gives
 * O(1) deep paging; `page` stays for simple clients. The route caches the serialised result.
 */
export async function searchPublic(query: JobListQuery): Promise<JobListDTO> {
  const filter = buildListFilter(query);
  const { limit } = query;

  // Highest-salary order pages by number (an index on salaryMax keeps it ordered); newest uses the cursor.
  if (query.sort === 'salary') {
    const skip = (query.page - 1) * limit;
    const [rows, total] = await Promise.all([
      Job.find(filter).select('-description').sort({ salaryMax: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      cachedCount(filter)
    ]);
    // Salary order pages by number: clients continue with page + 1 while page * limit < total.
    return { jobs: rows.map(presentJob), total, page: query.page, limit, nextCursor: null };
  }

  const { cursor } = query;
  const skip = cursor ? 0 : (query.page - 1) * limit;

  const [rows, total] = await Promise.all([
    Job.find(cursor ? { ...filter, ...afterCursor(cursor) } : filter)
      .select('-description')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit + 1)
      .lean(),
    cursor ? Promise.resolve(undefined) : cachedCount(filter)
  ]);

  const hasMore = rows.length > limit;
  const jobs = hasMore ? rows.slice(0, limit) : rows;
  const last = jobs[jobs.length - 1];
  return {
    jobs: jobs.map(presentJob),
    ...(total !== undefined && { total }),
    ...(!cursor && { page: query.page }),
    limit,
    nextCursor: hasMore && last ? encodeCursor(last) : null
  };
}

export async function getPublic(id: string): Promise<{ job: JobDetailDTO }> {
  const job = await Job.findById(id).populate('company').lean();
  if (!job) throw notFound('Job not found');
  const { companyName: _n, companyLogoUrl: _l, ...rest } = job;
  return { job: withId(rest) };
}

export async function listMine(
  userId: string,
  page: number,
  limit: number
): Promise<{ jobs: JobListItemDTO[]; total: number; page: number; limit: number }> {
  const skip = (page - 1) * limit;
  const filter = { postedBy: userId };
  const jobs = await Job.find(filter).select('-description').sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean();
  // A short page already tells us the total; only a full page needs a count.
  const total = jobs.length < limit ? skip + jobs.length : await Job.countDocuments(filter);

  // Applications received per job, in one grouped query.
  const counts = await Application.aggregate<{ _id: unknown; n: number }>([
    { $match: { job: { $in: jobs.map((j) => j._id) } } },
    { $group: { _id: '$job', n: { $sum: 1 } } }
  ]);
  const countByJob = new Map(counts.map((c) => [String(c._id), c.n]));
  return { jobs: jobs.map((j) => ({ ...presentJob(j), applicantCount: countByJob.get(String(j._id)) ?? 0 })), total, page, limit };
}

export async function createJob(userId: string, body: JobCreateBody) {
  const profile = await RecruiterProfile.findOne({ user: userId }).select('company').lean();
  if (!profile?.company) throw badRequest('Create a company profile before posting jobs');
  if (String(profile.company) !== body.company) throw forbidden('You can only post jobs under your own company');

  const company = await Company.findById(profile.company).select('name logoUrl').lean();
  if (!company) throw notFound('Company not found');

  const { company: _company, ...fields } = body;
  const job = await Job.create({
    ...fields,
    company: company._id,
    companyName: company.name,
    companyLogoUrl: company.logoUrl,
    postedBy: userId
  });
  events.emit('jobs.changed', { jobId: String(job._id) });
  events.emit('job.created', { jobId: String(job._id), recruiterId: userId });
  return withId(job);
}

/** Loads the job and proves the caller posted it (FR-02/FR-06: recruiters only touch their own jobs). */
export async function requireOwnedJob(jobId: string, userId: string) {
  const job = await Job.findById(jobId);
  if (!job) throw notFound('Job not found');
  if (String(job.postedBy) !== userId) throw forbidden('You do not own this job posting');
  return job;
}

export async function assertJobOwner(jobId: string, userId: string): Promise<void> {
  const job = await Job.findById(jobId).select('postedBy').lean();
  if (!job) throw notFound('Job not found');
  if (String(job.postedBy) !== userId) throw forbidden('You do not own this job posting');
}

export async function updateJob(jobId: string, userId: string, body: JobUpdateBody) {
  const job = await requireOwnedJob(jobId, userId);
  const defined = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  job.set(defined);

  await withTransaction(async (session) => {
    await job.save({ session });
    // Applications carry a snapshot of the job title/location; keep it in sync atomically.
    if (body.title !== undefined || body.location !== undefined) {
      await Application.updateMany({ job: job._id }, { $set: { jobTitle: job.title, jobLocation: job.location } }, { session });
    }
  });
  events.emit('jobs.changed', { jobId });
  return withId(job);
}

export async function closeJob(jobId: string, userId: string) {
  const job = await requireOwnedJob(jobId, userId);
  job.status = 'CLOSED';
  await job.save();
  events.emit('jobs.changed', { jobId });
  return withId(job);
}

// Applications are removed with the job so no orphans remain.
export async function deleteJob(jobId: string, userId: string): Promise<void> {
  const job = await requireOwnedJob(jobId, userId);
  await withTransaction(async (session) => {
    await Application.deleteMany({ job: job._id }, { session });
    await SavedJob.deleteMany({ job: job._id }, { session });
    await Job.deleteOne({ _id: job._id }, { session });
  });
  events.emit('jobs.changed', { jobId });
}
