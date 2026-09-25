import { Schema, model, type Types } from 'mongoose';
import { ROLES, type Role } from '@jobportal/shared';

export interface UserAttrs {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserAttrs>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: 'JOB_SEEKER' },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true, autoIndex: false }
);

export const User = model<UserAttrs>('User', userSchema);
