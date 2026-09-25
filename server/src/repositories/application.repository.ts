import { Types, type ClientSession, type FilterQuery } from 'mongoose';
import type { ApplicationStatus, PaginationQuery } from '@jobportal/shared';
import { Application, type ApplicationAttrs, type NoteAttrs } from '../models';
import { skipFor } from '../utils/pagination';

export type ApplicationRow = Omit<ApplicationAttrs, 'notes'>;

/** Notes are private to recruiters and potentially large: never loaded unless asked for. */
const WITHOUT_NOTES = '-notes';
/** Lists do not need the full history, only the last entry (for "in this stage since"). */
const LIST_FIELDS = { notes: 0, statusHistory: { $slice: -1 } } as const;

export async function create(
  attrs: Omit<ApplicationAttrs, '_id' | 'createdAt' | 'updatedAt' | 'appliedAt' | 'notes'>
): Promise<ApplicationRow> {
  const created = await Application.create(attrs);
  const { notes: _notes, ...row } = created.toObject();
  return row;
}

export const findById = (id: string) => Application.findById(id).select(WITHOUT_NOTES).lean<ApplicationRow>();

export const findNotes = async (id: string): Promise<NoteAttrs[]> => (await Application.findById(id).select('notes').lean())?.notes ?? [];

export const countForJob = (jobId: unknown) => Application.countDocuments({ job: jobId });

export const existsForJob = async (jobId: unknown): Promise<boolean> => Boolean(await Application.exists({ job: jobId }));

export async function list(filter: FilterQuery<ApplicationAttrs>, paging: PaginationQuery): Promise<[ApplicationRow[], number]> {
  return Promise.all([
    Application.find(filter, LIST_FIELDS)
      .sort({ appliedAt: -1, _id: -1 })
      .skip(skipFor(paging))
      .limit(paging.limit)
      .lean<ApplicationRow[]>(),
    Application.countDocuments(filter)
  ]);
}

/**
 * Moves an application from `from` to `to` only if it is still in `from`. Two recruiters acting at once cannot
 * both succeed, and a stale client cannot skip a step: the loser gets null (-> 409).
 */
export const transition = (id: Types.ObjectId, from: ApplicationStatus, to: ApplicationStatus, changedBy: string) =>
  Application.findOneAndUpdate(
    { _id: id, status: from },
    { $set: { status: to }, $push: { statusHistory: { status: to, changedBy, changedAt: new Date() } } },
    { new: true, projection: { notes: 0 } }
  ).lean<ApplicationRow>();

const MAX_NOTES = 200;

export async function addNote(id: Types.ObjectId, text: string, author: string): Promise<NoteAttrs | null> {
  const updated = await Application.findOneAndUpdate(
    { _id: id },
    { $push: { notes: { $each: [{ text, author, createdAt: new Date() }], $slice: -MAX_NOTES } } },
    { new: true, projection: { notes: { $slice: -1 } } }
  ).lean();
  return updated?.notes?.at(-1) ?? null;
}

// ---- snapshot maintenance & cascades -----------------------------------------------------------

export const syncJobSnapshot = (jobId: unknown, snapshot: { jobTitle: string; jobLocation: string }, session?: ClientSession) =>
  Application.updateMany({ job: jobId }, { $set: snapshot }, { session });

export const syncCompanyName = (companyId: unknown, companyName: string, session?: ClientSession) =>
  Application.updateMany({ company: companyId }, { $set: { companyName } }, { session });

export const syncApplicantName = (applicantId: string, applicantName: string) =>
  Application.updateMany({ applicant: applicantId }, { $set: { applicantName } });

export const deleteForJobs = (jobIds: Types.ObjectId[], session?: ClientSession) =>
  Application.deleteMany({ job: { $in: jobIds } }, { session });

export const deleteForApplicant = (userId: unknown, session?: ClientSession) => Application.deleteMany({ applicant: userId }, { session });

export const resumeIdsForJobs = (jobIds: Types.ObjectId[]) =>
  Application.distinct('resume', { job: { $in: jobIds } }) as Promise<Types.ObjectId[]>;

export const resumeIdsForApplicant = (userId: unknown) =>
  Application.distinct('resume', { applicant: userId }) as Promise<Types.ObjectId[]>;

// ---- authorisation helpers ---------------------------------------------------------------------

/** Is this resume attached to any application for a job of `companyId`? (recruiter download rule) */
export const resumeSentToCompany = async (resumeId: Types.ObjectId, companyId: Types.ObjectId | string): Promise<boolean> =>
  Boolean(await Application.exists({ resume: resumeId, company: companyId }));

export const resumeIsReferenced = async (resumeId: Types.ObjectId): Promise<boolean> =>
  Boolean(await Application.exists({ resume: resumeId }));

// ---- recruiter dashboard -----------------------------------------------------------------------

export async function dashboard(companyId: Types.ObjectId) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const staleBefore = new Date(Date.now() - 3 * 86_400_000);
  const staleFilter = { company: companyId, status: 'APPLIED' as const, appliedAt: { $lt: staleBefore } };

  const [byStatus, newThisWeek, recent, stale, staleCount] = await Promise.all([
    Application.aggregate<{ _id: ApplicationStatus; n: number }>([
      { $match: { company: new Types.ObjectId(String(companyId)) } },
      { $group: { _id: '$status', n: { $sum: 1 } } }
    ]),
    Application.countDocuments({ company: companyId, appliedAt: { $gte: weekAgo } }),
    Application.find({ company: companyId }, LIST_FIELDS).sort({ appliedAt: -1, _id: -1 }).limit(5).lean<ApplicationRow[]>(),
    Application.find(staleFilter, LIST_FIELDS).sort({ appliedAt: 1 }).limit(5).lean<ApplicationRow[]>(),
    Application.countDocuments(staleFilter)
  ]);
  return { byStatus, newThisWeek, recent, stale, staleCount };
}
