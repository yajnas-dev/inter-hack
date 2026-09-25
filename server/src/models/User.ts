import { Schema, model, type Types } from 'mongoose';
import { ROLES, type Role } from '@jobportal/shared';

export interface UserAttrs {
  _id: Types.ObjectId;
  name: string;
  email: string;
  /** bcrypt hash; never selected unless asked for explicitly. */
  password: string;
  role: Role;
  isActive: boolean;
  /** Access tokens issued before this instant are rejected (password change, deactivation). */
  sessionsValidAfter?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserAttrs>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: 'JOB_SEEKER' },
    isActive: { type: Boolean, default: true },
    sessionsValidAfter: Date,
    lastLoginAt: Date
  },
  { timestamps: true, autoIndex: false }
);

// Admin user table: newest first, optionally filtered by role / active state.
userSchema.index({ createdAt: -1, _id: -1 });
userSchema.index({ role: 1, createdAt: -1, _id: -1 });

export const User = model<UserAttrs>('User', userSchema);
