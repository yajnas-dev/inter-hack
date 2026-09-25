import type { ClientSession, Types } from 'mongoose';
import type { PaginationQuery } from '@jobportal/shared';
import { SavedJob } from '../models';
import { skipFor } from '../utils/pagination';

/** Idempotent: saving twice leaves one row (unique {user, job}). */
export const save = (userId: string, jobId: string) =>
  SavedJob.updateOne({ user: userId, job: jobId }, { $setOnInsert: { user: userId, job: jobId } }, { upsert: true });

export const remove = (userId: string, jobId: string) => SavedJob.deleteOne({ user: userId, job: jobId });

export const jobIdsForUser = async (userId: string): Promise<string[]> =>
  (await SavedJob.find({ user: userId }).sort({ createdAt: -1 }).limit(500).select('job').lean()).map((r) => String(r.job));

export const pageForUser = (userId: string, paging: PaginationQuery) =>
  Promise.all([
    SavedJob.find({ user: userId }).sort({ createdAt: -1, _id: -1 }).skip(skipFor(paging)).limit(paging.limit).select('job').lean(),
    SavedJob.countDocuments({ user: userId })
  ]);

export const deleteForJobs = (jobIds: Types.ObjectId[], session?: ClientSession) =>
  SavedJob.deleteMany({ job: { $in: jobIds } }, { session });
export const deleteForUser = (userId: unknown, session?: ClientSession) => SavedJob.deleteMany({ user: userId }, { session });
