import type { ClientSession, FilterQuery, Types } from 'mongoose';
import type { AdminCompanyListQuery, CompanyUpdateBody } from '@jobportal/shared';
import { Company, Job, type CompanyAttrs } from '../models';
import { escapeRegex } from '../utils/escapeRegex';
import { skipFor } from '../utils/pagination';

export const findById = (id: string | Types.ObjectId, session?: ClientSession) =>
  Company.findById(id)
    .session(session ?? null)
    .lean();

export const findByCreator = (userId: string) => Company.findOne({ createdBy: userId }).lean();

export async function create(
  attrs: CompanyUpdateBody & { name: string; createdBy: string },
  session?: ClientSession
): Promise<CompanyAttrs> {
  const [created] = await Company.create([attrs], { session });
  return created!.toObject();
}

/** Uses a document save so schema validators and the nameLower mirror run. */
export async function update(id: string, changes: CompanyUpdateBody, session?: ClientSession): Promise<CompanyAttrs | null> {
  const doc = await Company.findById(id).session(session ?? null);
  if (!doc) return null;
  doc.set(changes);
  await doc.save({ session });
  return doc.toObject();
}

export async function list(query: AdminCompanyListQuery): Promise<[Array<CompanyAttrs & { openJobs: number }>, number]> {
  const filter: FilterQuery<CompanyAttrs> = query.q ? { nameLower: { $regex: `^${escapeRegex(query.q.toLowerCase())}` } } : {};
  const [rows, total] = await Promise.all([
    Company.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skipFor(query)).limit(query.limit).lean(),
    Company.countDocuments(filter)
  ]);
  // Open-job counts for this page only, in one grouped query (no N+1).
  const counts = await Job.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { company: { $in: rows.map((r) => r._id) }, status: 'OPEN' } },
    { $group: { _id: '$company', n: { $sum: 1 } } }
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  return [rows.map((r) => ({ ...r, openJobs: byId.get(String(r._id)) ?? 0 })), total];
}

export const idsCreatedBy = (userId: unknown, session?: ClientSession) =>
  Company.find({ createdBy: userId })
    .session(session ?? null)
    .distinct('_id') as Promise<Types.ObjectId[]>;

export const deleteById = (id: unknown, session?: ClientSession) => Company.deleteOne({ _id: id }, { session });
