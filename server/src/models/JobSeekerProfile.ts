import { Schema, model, type Types } from 'mongoose';

export interface EducationAttrs {
  degree?: string;
  institution?: string;
  fieldOfStudy?: string;
  startYear?: number | null;
  endYear?: number | null;
  grade?: string;
}

export interface ExperienceAttrs {
  title?: string;
  company?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  isCurrent?: boolean;
  description?: string;
}

export interface JobSeekerProfileAttrs {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  headline?: string;
  phone?: string;
  address?: string;
  dateOfBirth?: Date | null;
  totalExperienceYears?: number | null;
  education: EducationAttrs[];
  experience: ExperienceAttrs[];
  skills: string[];
  /** The current resume (used for new applications). */
  resume?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const educationSchema = new Schema<EducationAttrs>(
  {
    degree: { type: String, maxlength: 120 },
    institution: { type: String, maxlength: 160 },
    fieldOfStudy: { type: String, maxlength: 120 },
    startYear: Number,
    endYear: Number,
    grade: { type: String, maxlength: 40 }
  },
  { _id: false }
);

const experienceSchema = new Schema<ExperienceAttrs>(
  {
    title: { type: String, maxlength: 120 },
    company: { type: String, maxlength: 160 },
    startDate: Date,
    endDate: Date,
    isCurrent: { type: Boolean, default: false },
    description: { type: String, maxlength: 2000 }
  },
  { _id: false }
);

const jobSeekerProfileSchema = new Schema<JobSeekerProfileAttrs>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    headline: { type: String, maxlength: 160 },
    phone: { type: String, maxlength: 30 },
    address: { type: String, maxlength: 300 },
    dateOfBirth: Date,
    totalExperienceYears: { type: Number, min: 0, max: 60 },
    // Embedded: always read and written with the profile, and bounded in size.
    education: { type: [educationSchema], validate: [(v: unknown[]) => v.length <= 20, 'At most 20 education entries'] },
    experience: { type: [experienceSchema], validate: [(v: unknown[]) => v.length <= 30, 'At most 30 experience entries'] },
    skills: { type: [{ type: String, trim: true, maxlength: 60 }], validate: [(v: string[]) => v.length <= 50, 'At most 50 skills'] },
    resume: { type: Schema.Types.ObjectId, ref: 'Resume' }
  },
  { timestamps: true, autoIndex: false }
);

jobSeekerProfileSchema.index({ user: 1 }, { unique: true });

export const JobSeekerProfile = model<JobSeekerProfileAttrs>('JobSeekerProfile', jobSeekerProfileSchema);
