import type { ClientSession, Types } from 'mongoose';
import { Resume, type ResumeAttrs } from '../models';

export type ResumeRow = Omit<ResumeAttrs, 'text'>;

export async function create(attrs: Omit<ResumeAttrs, '_id' | 'createdAt' | 'updatedAt' | 'archivedAt'>): Promise<ResumeRow> {
  const created = await Resume.create(attrs);
  const { text: _text, ...row } = created.toObject();
  return row;
}

export const findById = (id: string | Types.ObjectId) => Resume.findById(id).lean<ResumeRow>();

export const findTextById = async (id: Types.ObjectId): Promise<string | undefined> =>
  (await Resume.findById(id).select('+text').lean())?.text;

export const findManyByIds = (ids: Types.ObjectId[]) =>
  Resume.find({ _id: { $in: ids } })
    .select('originalName mimeType size createdAt')
    .lean<ResumeRow[]>();

/** The owner's resumes they have not removed, newest first (bounded: a person has few). */
export const listForOwner = (ownerId: string) =>
  Resume.find({ owner: ownerId, archivedAt: { $exists: false } })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean<ResumeRow[]>();

export const archive = (id: Types.ObjectId) => Resume.updateOne({ _id: id }, { $set: { archivedAt: new Date() } });

export const deleteById = (id: Types.ObjectId, session?: ClientSession) => Resume.deleteOne({ _id: id }, { session });

export const listAllForOwner = (ownerId: unknown) => Resume.find({ owner: ownerId }).select('fileId').lean<ResumeRow[]>();
