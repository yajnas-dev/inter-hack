import { Schema, model, type Types } from 'mongoose';

export interface CompanyAttrs {
  _id: Types.ObjectId;
  name: string;
  /** Lower-cased mirror for indexed, case-insensitive prefix search. */
  nameLower?: string;
  description?: string;
  website?: string;
  industry?: string;
  location?: string;
  logoUrl?: string;
  /** The recruiter who registered the company. One company per recruiter (unique). */
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const url = { type: String, maxlength: 500, match: /^https?:\/\//i };

const companySchema = new Schema<CompanyAttrs>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    nameLower: { type: String, select: false },
    description: { type: String, maxlength: 4000 },
    website: url,
    industry: { type: String, maxlength: 120 },
    location: { type: String, maxlength: 160 },
    logoUrl: url,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  {
    timestamps: true,
    autoIndex: false,
    toObject: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.nameLower;
        return ret;
      }
    }
  }
);

companySchema.pre('validate', function syncMirror(next) {
  this.nameLower = (this.name ?? '').toLowerCase();
  next();
});

companySchema.index({ createdBy: 1 }, { unique: true });
companySchema.index({ nameLower: 1 });
companySchema.index({ createdAt: -1, _id: -1 });

export const Company = model<CompanyAttrs>('Company', companySchema);
