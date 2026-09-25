import type { JobListItemDTO } from '@jobportal/shared';
import { Job, SavedJob } from '../../models';
import { notFound } from '../../http/errors';
import { presentJob } from '../../utils/presenters';

/** Bookmark a job. Idempotent: saving twice is not an error. */
export async function save(userId: string, jobId: string): Promise<void> {
  if (!(await Job.exists({ _id: jobId }))) throw notFound('Job not found');
  await SavedJob.updateOne({ user: userId, job: jobId }, { $setOnInsert: { user: userId, job: jobId } }, { upsert: true });
}

export async function unsave(userId: string, jobId: string): Promise<void> {
  await SavedJob.deleteOne({ user: userId, job: jobId });
}

/** Just the ids, so the client can mark hearts on any (anonymously cached) job list. */
export async function savedIds(userId: string): Promise<string[]> {
  const rows = await SavedJob.find({ user: userId }).select('job').lean();
  return rows.map((r) => String(r.job));
}

export async function listSaved(
  userId: string,
  page: number,
  limit: number
): Promise<{ jobs: JobListItemDTO[]; total: number; page: number; limit: number }> {
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    SavedJob.find({ user: userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).select('job').lean(),
    SavedJob.countDocuments({ user: userId })
  ]);
  const jobs = await Job.find({ _id: { $in: rows.map((r) => r.job) } })
    .select('-description')
    .lean();
  const byId = new Map(jobs.map((j) => [String(j._id), j]));
  // Keep the order they were saved in; jobs deleted since are skipped.
  const ordered = rows.map((r) => byId.get(String(r.job))).filter((j): j is NonNullable<typeof j> => Boolean(j));
  return { jobs: ordered.map(presentJob), total, page, limit };
}
