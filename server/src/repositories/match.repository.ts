import type { Types } from 'mongoose';
import type { MatchAnalysisDTO } from '@jobportal/shared';
import { MatchAnalysis } from '../models';

export const find = async (job: Types.ObjectId, candidate: Types.ObjectId, fingerprint: string) =>
  (await MatchAnalysis.findOne({ job, candidate, fingerprint }).lean())?.result ?? null;

export const store = (job: Types.ObjectId, candidate: Types.ObjectId, fingerprint: string, result: Omit<MatchAnalysisDTO, 'cached'>) =>
  MatchAnalysis.updateOne(
    { job, candidate, fingerprint },
    { $set: { result }, $setOnInsert: { job, candidate, fingerprint } },
    { upsert: true }
  );

export const deleteForJobs = (jobIds: Types.ObjectId[]) => MatchAnalysis.deleteMany({ job: { $in: jobIds } });
export const deleteForCandidate = (userId: unknown) => MatchAnalysis.deleteMany({ candidate: userId });
