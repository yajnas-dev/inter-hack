import { Schema, model, type Types } from 'mongoose';
import type { MatchAnalysisDTO } from '@jobportal/shared';

/**
 * Cache of AI match analyses. Justified as a collection because each analysis costs a paid model call and
 * several seconds: repeat views of the same (candidate, job) pair are served from here while nothing relevant
 * changed. `fingerprint` hashes the inputs (resume id, profile/job versions, model), so any edit invalidates it.
 */
export interface MatchAnalysisAttrs {
  _id: Types.ObjectId;
  job: Types.ObjectId;
  candidate: Types.ObjectId;
  fingerprint: string;
  result: Omit<MatchAnalysisDTO, 'cached'>;
  createdAt: Date;
}

const matchAnalysisSchema = new Schema<MatchAnalysisAttrs>(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fingerprint: { type: String, required: true },
    result: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false }, autoIndex: false }
);

matchAnalysisSchema.index({ job: 1, candidate: 1, fingerprint: 1 }, { unique: true });
// Analyses expire after 7 days (models improve; stale advice is not worth keeping).
matchAnalysisSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 86_400 });

export const MatchAnalysis = model<MatchAnalysisAttrs>('MatchAnalysis', matchAnalysisSchema);
