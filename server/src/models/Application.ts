import { Schema, model, type Types } from 'mongoose';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@jobportal/shared';

export interface StatusHistoryEntry {
  status: ApplicationStatus;
  changedAt: Date;
  changedBy?: Types.ObjectId;
}

export interface NoteAttrs {
  _id: Types.ObjectId;
  text: string;
  author: Types.ObjectId;
  createdAt: Date;
}

export interface ApplicationAttrs {
  _id: Types.ObjectId;
  job: Types.ObjectId;
  applicant: Types.ObjectId;
  /** Owning company of the job: the authorisation key for recruiters, copied at apply time (never changes). */
  company: Types.ObjectId;
  /** The recruiter who posted the job (notification routing only; not used for authorisation). */
  recruiter?: Types.ObjectId;
  /** The exact resume sent with this application. */
  resume?: Types.ObjectId;
  /**
   * Display snapshots so every list renders from this document with no joins. Job title/location and company
   * name are kept in sync when those change.
   */
  applicantName?: string;
  applicantEmail?: string;
  jobTitle?: string;
  jobLocation?: string;
  companyName?: string;
  status: ApplicationStatus;
  statusHistory: StatusHistoryEntry[];
  coverNote?: string;
  /** Recruiter-only notes; never included in application responses. */
  notes?: NoteAttrs[];
  appliedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const applicationSchema = new Schema<ApplicationAttrs>(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    applicant: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    recruiter: { type: Schema.Types.ObjectId, ref: 'User' },
    resume: { type: Schema.Types.ObjectId, ref: 'Resume' },
    applicantName: String,
    applicantEmail: String,
    jobTitle: String,
    jobLocation: String,
    companyName: String,
    status: { type: String, enum: APPLICATION_STATUSES, default: 'APPLIED', required: true },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: APPLICATION_STATUSES, required: true },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: 'User' }
      }
    ],
    coverNote: { type: String, maxlength: 2000 },
    notes: [
      {
        text: { type: String, required: true, maxlength: 2000 },
        author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    appliedAt: { type: Date, default: Date.now }
  },
  { timestamps: true, autoIndex: false }
);

// No duplicate applications for the same job: enforced by the database, not only by a pre-check.
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });
// Seeker: my applications, newest first (optionally by status).
applicationSchema.index({ applicant: 1, appliedAt: -1, _id: -1 });
// Recruiter: applicants of one job (optionally by stage).
applicationSchema.index({ job: 1, status: 1, appliedAt: -1 });
applicationSchema.index({ job: 1, appliedAt: -1, _id: -1 });
// Recruiter dashboard / company-wide lists and reports.
applicationSchema.index({ company: 1, appliedAt: -1, _id: -1 });
applicationSchema.index({ company: 1, status: 1, appliedAt: 1 });
// Admin table and the time-series report.
applicationSchema.index({ appliedAt: -1, _id: -1 });
// Resume download authorisation ("is this resume attached to an application for my company?").
applicationSchema.index({ resume: 1, company: 1 });

export const Application = model<ApplicationAttrs>('Application', applicationSchema);
