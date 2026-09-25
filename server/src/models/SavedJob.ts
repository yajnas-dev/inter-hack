import { type Types, Schema, model } from 'mongoose';

/** A job a seeker bookmarked. One row per (user, job). */
export interface SavedJobAttrs {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  job: Types.ObjectId;
  createdAt: Date;
}

const savedJobSchema = new Schema<SavedJobAttrs>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false }, autoIndex: false }
);

savedJobSchema.index({ user: 1, job: 1 }, { unique: true });
savedJobSchema.index({ user: 1, createdAt: -1 });
savedJobSchema.index({ job: 1 });

export const SavedJob = model<SavedJobAttrs>('SavedJob', savedJobSchema);
