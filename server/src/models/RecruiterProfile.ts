import { Schema, model, type Types } from 'mongoose';

export interface RecruiterProfileAttrs {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  company?: Types.ObjectId;
  designation?: string;
  phone?: string;
}

const recruiterProfileSchema = new Schema<RecruiterProfileAttrs>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    designation: String,
    phone: String
  },
  { timestamps: true, autoIndex: false }
);

export const RecruiterProfile = model<RecruiterProfileAttrs>('RecruiterProfile', recruiterProfileSchema);
