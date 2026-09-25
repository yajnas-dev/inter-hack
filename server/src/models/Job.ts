import { Schema, model, type Types } from 'mongoose';
import { EMPLOYMENT_TYPES, JOB_STATUSES, type EmploymentType, type JobStatus } from '@jobportal/shared';
import { tokenize } from '../utils/tokenize';

export interface JobAttrs {
  _id: Types.ObjectId;
  title: string;
  company: Types.ObjectId;
  /** Snapshot of the company's display fields so list endpoints need no populate. */
  companyName?: string;
  companyLogoUrl?: string;
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
    title: { type: String, required: true, trim: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    companyName: String,
    companyLogoUrl: String,
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true },
    location: { type: String, required: true, trim: true },
    salaryMin: { type: Number, required: true, min: 0 },
    salaryMax: { type: Number, required: true, min: 0 },
    requiredSkills: [{ type: String, trim: true }],
    experienceRequired: { type: Number, required: true, min: 0 },
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

// Every listing sorts newest-first with _id as tie-breaker (keyset pagination), so each index ends in
// createdAt/_id and Mongo returns rows already ordered: no in-memory SORT stage.
jobSchema.index({ status: 1, createdAt: -1, _id: -1 });
jobSchema.index({ status: 1, employmentType: 1, createdAt: -1, _id: -1 });
jobSchema.index({ status: 1, employmentType: 1, experienceRequired: 1, locationLower: 1 });
jobSchema.index({ status: 1, requiredSkillsLower: 1, createdAt: -1, _id: -1 });
jobSchema.index({ status: 1, titleTokens: 1, createdAt: -1, _id: -1 });
jobSchema.index({ postedBy: 1, createdAt: -1, _id: -1 });
jobSchema.index({ status: 1, company: 1, createdAt: -1, _id: -1 });
jobSchema.index({ status: 1, salaryMax: -1, _id: -1 });

export const Job = model<JobAttrs>('Job', jobSchema);
