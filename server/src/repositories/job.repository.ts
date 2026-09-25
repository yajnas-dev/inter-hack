import type { ClientSession, FilterQuery, Types } from 'mongoose';
import type { AdminJobListQuery, JobFacetsDTO, JobListQuery, MyJobsQuery } from '@jobportal/shared';
import { Application, Job, type CompanyAttrs, type JobAttrs } from '../models';
import { afterCursor, encodeCursor, mongoSort, parseSort } from '../utils/cursor';
import { escapeRegex } from '../utils/escapeRegex';
import { skipFor } from '../utils/pagination';
import { tokenize } from '../utils/tokenize';

export type JobRow = Omit<JobAttrs, 'description'>;
const LIST_FIELDS = '-description';

// ---- public search ---------------------------------------------------------------------------

/** Translates validated filters into one MongoDB filter. Every clause is served by an index (see models/Job.ts). */
export function buildSearchFilter(query: JobListQuery): FilterQuery<JobAttrs> {
  const filter: FilterQuery<JobAttrs> = { status: 'OPEN' };

  if (query.title) {
    const words = tokenize(query.title);
    if (words.length) filter.titleTokens = { $all: words };
  }
  // Anchored prefix on a lower-cased mirror: case-insensitive AND index-assisted. User input is escaped.
  if (query.location) filter.locationLower = { $regex: `^${escapeRegex(query.location.toLowerCase())}` };
  if (query.employmentType?.length) {
    filter.employmentType = query.employmentType.length === 1 ? query.employmentType[0] : { $in: query.employmentType };
  }
  if (query.company) filter.company = query.company;
  if (query.minSalary !== undefined) filter.salaryMax = { $gte: query.minSalary };
  if (query.postedWithin) {
    // Rounded to 5 minutes so equivalent searches share public-cache entries.
    const now = Math.floor(Date.now() / 300_000) * 300_000;
    filter.createdAt = { $gte: new Date(now - query.postedWithin * 86_400_000) };
  }
  if (query.experience !== undefined) filter.experienceRequired = { $lte: query.experience };
  if (query.skills?.length) filter.requiredSkillsLower = { $in: query.skills.map((s) => s.toLowerCase()) };
  return filter;
}

export interface SearchPage {
  rows: JobRow[];
  hasNextPage: boolean;
  nextCursor: string | null;
}

/** One page in the requested order. Fetches limit + 1 rows to know whether another page exists. */
export async function search(query: JobListQuery, filter = buildSearchFilter(query)): Promise<SearchPage> {
  const sort = parseSort(query.sort);
  const where = query.cursor ? { $and: [filter, afterCursor(sort, query.cursor)] } : filter;
  const rows = await Job.find(where)
    .select(LIST_FIELDS)
    .sort(mongoSort(sort))
    .skip(query.cursor ? 0 : skipFor(query))
    .limit(query.limit + 1)
    .lean<JobRow[]>();

  const hasNextPage = rows.length > query.limit;
  const page = hasNextPage ? rows.slice(0, query.limit) : rows;
  const last = page.at(-1);
  return { rows: page, hasNextPage, nextCursor: hasNextPage && last ? encodeCursor(sort, last) : null };
}

export const count = (filter: FilterQuery<JobAttrs>) => Job.countDocuments(filter);

export async function facets(): Promise<JobFacetsDTO> {
  type NameCount = { name: string; count: number };
  const open = { $match: { status: 'OPEN' } };
  const [locations, skills, types, totalOpen] = await Promise.all([
    Job.aggregate<NameCount>([
      open,
      { $group: { _id: '$locationLower', name: { $first: '$location' }, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 12 },
      { $project: { _id: 0, name: 1, count: 1 } }
    ]),
    Job.aggregate<NameCount>([
      open,
      { $unwind: '$requiredSkills' },
      { $group: { _id: { $toLower: '$requiredSkills' }, name: { $first: '$requiredSkills' }, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 20 },
      { $project: { _id: 0, name: 1, count: 1 } }
    ]),
    Job.aggregate<{ _id: JobFacetsDTO['employmentTypes'][number]['name']; count: number }>([
      open,
      { $group: { _id: '$employmentType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Job.countDocuments({ status: 'OPEN' })
  ]);
  return { locations, skills, employmentTypes: types.map((t) => ({ name: t._id, count: t.count })), totalOpen };
}

/** Open jobs at the same company or sharing a required skill, newest first. */
export async function similarTo(job: Pick<JobAttrs, '_id' | 'company' | 'requiredSkillsLower'>, limit = 4): Promise<JobRow[]> {
  return Job.find({
    status: 'OPEN',
    _id: { $ne: job._id },
    $or: [{ company: job.company }, { requiredSkillsLower: { $in: job.requiredSkillsLower ?? [] } }]
  })
    .select(LIST_FIELDS)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean<JobRow[]>();
}

// ---- single job ------------------------------------------------------------------------------

export const findById = (id: string | Types.ObjectId) => Job.findById(id).lean<JobAttrs>();

/** Including the lower-cased skill mirror (for matching). */
export const findWithSkills = (id: string | Types.ObjectId) => Job.findById(id).select('+requiredSkillsLower').lean<JobAttrs>();

export const findDetail = (id: string) =>
  Job.findById(id).populate<{ company: CompanyAttrs }>('company').lean<Omit<JobAttrs, 'company'> & { company: CompanyAttrs | null }>();

export const findManyForList = (ids: Types.ObjectId[]) =>
  ids.length
    ? Job.find({ _id: { $in: ids } })
        .select(LIST_FIELDS)
        .lean<JobRow[]>()
    : Promise.resolve([] as JobRow[]);

/** Hydrated document, for updates that must run schema validators and the search-mirror hook. */
export const findDocument = (id: string) => Job.findById(id);

export const create = (attrs: Omit<JobAttrs, '_id' | 'createdAt' | 'updatedAt' | 'status' | 'vacancies'> & { vacancies?: number }) =>
  Job.create(attrs);

// ---- recruiter & admin lists -----------------------------------------------------------------

async function withApplicantCounts<T extends { _id: Types.ObjectId }>(rows: T[]): Promise<Array<T & { applicantCount: number }>> {
  // One grouped query for the whole page (no N+1).
  const counts = await Application.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { job: { $in: rows.map((j) => j._id) } } },
    { $group: { _id: '$job', n: { $sum: 1 } } }
  ]);
  const byJob = new Map(counts.map((c) => [String(c._id), c.n]));
  return rows.map((j) => ({ ...j, applicantCount: byJob.get(String(j._id)) ?? 0 }));
}

export async function listForCompany(companyId: Types.ObjectId, query: MyJobsQuery) {
  const filter: FilterQuery<JobAttrs> = { company: companyId, ...(query.status && { status: query.status }) };
  const [rows, total] = await Promise.all([
    Job.find(filter).select(LIST_FIELDS).sort({ createdAt: -1, _id: -1 }).skip(skipFor(query)).limit(query.limit).lean<JobRow[]>(),
    Job.countDocuments(filter)
  ]);
  return { rows: await withApplicantCounts(rows), total };
}

export async function listAll(query: AdminJobListQuery) {
  const filter: FilterQuery<JobAttrs> = {};
  if (query.status) filter.status = query.status;
  if (query.company) filter.company = query.company;
  if (query.q) {
    const words = tokenize(query.q);
    if (words.length) filter.titleTokens = { $all: words };
  }
  const [rows, total] = await Promise.all([
    Job.find(filter)
      .select(LIST_FIELDS)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skipFor(query))
      .limit(query.limit)
      .populate<{ postedBy: { _id: Types.ObjectId; name: string; email: string } | null }>('postedBy', 'name email')
      .lean(),
    Job.countDocuments(filter)
  ]);
  return { rows: await withApplicantCounts(rows), total };
}

// ---- writes ----------------------------------------------------------------------------------

export const syncCompanySnapshot = (
  companyId: unknown,
  snapshot: { companyName: string; companyLogoUrl?: string },
  session?: ClientSession
) => Job.updateMany({ company: companyId }, { $set: snapshot }, { session });

export const setStatus = (id: string, status: JobAttrs['status']) =>
  Job.findByIdAndUpdate(id, { $set: { status } }, { new: true, runValidators: true }).lean<JobAttrs>();

export const idsWhere = (filter: FilterQuery<JobAttrs>, session?: ClientSession) =>
  Job.find(filter)
    .session(session ?? null)
    .distinct('_id') as Promise<Types.ObjectId[]>;

export const deleteByIds = (ids: Types.ObjectId[], session?: ClientSession) => Job.deleteMany({ _id: { $in: ids } }, { session });
