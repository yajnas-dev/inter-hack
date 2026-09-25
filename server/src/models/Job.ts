import { Schema, model, type Types } from 'mongoose';
import { EMPLOYMENT_TYPES, JOB_STATUSES, type EmploymentType, type JobStatus } from '@jobportal/shared';
import { tokenize } from '../utils/tokenize';

export interface JobAttrs {
  _id: Types.ObjectId;
  title: string;
  /** Owning company. Authorisation to change the job is decided by this, not by who posted it. */
  company: Types.ObjectId;
  /** Snapshot of the company's display fields so list endpoints need no join; kept in sync on company edits. */
  companyName?: string;
  companyLogoUrl?: string;
  /** The recruiter who created it (audit + notifications). */
  postedBy: Types.ObjectId;
  description: string;
  location: string;
  salaryMin: number;
  salaryMax: number;
  requiredSkills: string[];
  experienceRequired: number;
  employmentType: EmploymentType;
  status: JobStatus;
  vacancies: number;
  /** Search mirrors, derived in pre-validate and never sent to clients. */
  locationLower?: string;
  requiredSkillsLower?: string[];
  titleTokens?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<JobAttrs>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    companyName: String,
    companyLogoUrl: String,
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true, maxlength: 10_000 },
    location: { type: String, required: true, trim: true, maxlength: 160 },
    salaryMin: { type: Number, required: true, min: 0 },
    salaryMax: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator(this: JobAttrs, v: number) {
          return typeof this.salaryMin !== 'number' || v >= this.salaryMin;
        },
        message: 'salaryMax must be greater than or equal to salaryMin'
      }
    },
    requiredSkills: {
      type: [{ type: String, trim: true, maxlength: 60 }],
      validate: [(v: string[]) => v.length <= 30, 'At most 30 skills']
    },
    experienceRequired: { type: Number, required: true, min: 0, max: 60 },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: true },
    status: { type: String, enum: JOB_STATUSES, default: 'OPEN' },
    vacancies: { type: Number, default: 1, min: 1 },
    locationLower: { type: String, select: false },
    requiredSkillsLower: { type: [String], select: false },
    titleTokens: { type: [String], select: false }
  },
  {
    timestamps: true,
    autoIndex: false,
    toObject: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.locationLower;
        delete ret.requiredSkillsLower;
        delete ret.titleTokens;
        return ret;
      }
    }
  }
);

jobSchema.pre('validate', function syncMirrors(next) {
  this.locationLower = (this.location ?? '').toLowerCase();
  this.requiredSkillsLower = (this.requiredSkills ?? []).map((s) => s.toLowerCase());
  this.titleTokens = tokenize(this.title);
  next();
});

// Public search always filters status=OPEN and orders by (createdAt|salaryMax, _id), so each index starts with
// status and ends with the sort key + _id: rows come back already ordered (no in-memory SORT stage).
jobSchema.index({ status: 1, createdAt: -1, _id: -1 });
jobSchema.index({ status: 1, salaryMax: -1, _id: -1 });
jobSchema.index({ status: 1, employmentType: 1, createdAt: -1, _id: -1 });
jobSchema.index({ status: 1, employmentType: 1, experienceRequired: 1, locationLower: 1 });
jobSchema.index({ status: 1, requiredSkillsLower: 1, createdAt: -1, _id: -1 });
jobSchema.index({ status: 1, titleTokens: 1, createdAt: -1, _id: -1 });
jobSchema.index({ status: 1, company: 1, createdAt: -1, _id: -1 });
// A company's own jobs (recruiter dashboard, all statuses) and admin cascades.
jobSchema.index({ company: 1, createdAt: -1, _id: -1 });
jobSchema.index({ postedBy: 1 });
// Admin table.
jobSchema.index({ createdAt: -1, _id: -1 });

export const Job = model<JobAttrs>('Job', jobSchema);
