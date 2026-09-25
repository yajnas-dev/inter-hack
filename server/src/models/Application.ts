import { Schema, model, type Types } from 'mongoose';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@jobportal/shared';

export interface StatusHistoryEntry {
  status: ApplicationStatus;
  changedAt: Date;
  changedBy?: Types.ObjectId;
}

export interface ApplicationAttrs {
  _id: Types.ObjectId;
  job: Types.ObjectId;
  applicant: Types.ObjectId;
  /**
   * Denormalised at apply time (none of these change for a given application) so ownership checks,
   * per-company reports and every list render from this single document with no joins.
   */
  company?: Types.ObjectId;
  recruiter?: Types.ObjectId;
  applicantName?: string;
  applicantEmail?: string;
  jobTitle?: string;
  jobLocation?: string;
  companyName?: string;
  resumeSnapshot?: { fileId: Types.ObjectId; originalName: string; mimeType: string; size: number };
  status: ApplicationStatus;
  statusHistory: StatusHistoryEntry[];
  coverNote?: string;
  appliedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const applicationSchema = new Schema<ApplicationAttrs>(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    applicant: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company' },
    recruiter: { type: Schema.Types.ObjectId, ref: 'User' },
    applicantName: String,
    applicantEmail: String,
    jobTitle: String,
    jobLocation: String,
    companyName: String,
    resumeSnapshot: {
      fileId: Schema.Types.ObjectId,
      originalName: String,
      mimeType: String,
      size: Number
    },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'APPLIED' },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: APPLICATION_STATUSES },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: 'User' }
      }
    ],
    coverNote: String,
    appliedAt: { type: Date, default: Date.now }
  },
  { timestamps: true, autoIndex: false }
);

// FR-05: no duplicate applications for the same job, enforced by the database itself.
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });
applicationSchema.index({ applicant: 1, appliedAt: -1 });
applicationSchema.index({ job: 1, appliedAt: -1 });
applicationSchema.index({ recruiter: 1, status: 1 });
applicationSchema.index({ recruiter: 1, appliedAt: -1 });
applicationSchema.index({ 'resumeSnapshot.fileId': 1 }, { sparse: true });

export const Application = model<ApplicationAttrs>('Application', applicationSchema);
