import { Schema, model, type Types } from 'mongoose';

export interface CompanyAttrs {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  website?: string;
  industry?: string;
  location?: string;
  logoUrl?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const companySchema = new Schema<CompanyAttrs>(
  {
    name: { type: String, required: true, trim: true },
    description: String,
    website: String,
    industry: String,
    location: String,
    logoUrl: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }
  },
  { timestamps: true, autoIndex: false }
);

export const Company = model<CompanyAttrs>('Company', companySchema);
