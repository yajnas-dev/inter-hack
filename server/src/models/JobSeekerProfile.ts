import { Schema, model, type Types } from 'mongoose';

export interface StoredResume {
  fileId: Types.ObjectId;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt?: Date;
}

export interface JobSeekerProfileAttrs {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  headline?: string;
  phone?: string;
  address?: string;
  dateOfBirth?: Date;
  education: Array<Record<string, unknown>>;
  experience: Array<Record<string, unknown>>;
  skills: string[];
  resume?: StoredResume;
}

const educationSchema = new Schema(
  { degree: String, institution: String, fieldOfStudy: String, startYear: Number, endYear: Number, grade: String },
  { _id: false }
);

const experienceSchema = new Schema(
  {
    title: String,
    company: String,
    startDate: Date,
    endDate: Date,
    isCurrent: { type: Boolean, default: false },
    description: String
  },
  { _id: false }
);

const jobSeekerProfileSchema = new Schema<JobSeekerProfileAttrs>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    headline: String,
    phone: String,
    address: String,
    dateOfBirth: Date,
    education: [educationSchema],
    experience: [experienceSchema],
    skills: [{ type: String, trim: true }],
    resume: {
      fileId: Schema.Types.ObjectId,
      originalName: String,
      mimeType: String,
      size: Number,
      uploadedAt: Date
    }
  },
  { timestamps: true, autoIndex: false }
);

export const JobSeekerProfile = model<JobSeekerProfileAttrs>('JobSeekerProfile', jobSeekerProfileSchema);
