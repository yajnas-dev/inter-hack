import { Schema, model, type Types } from 'mongoose';

/** One row per issued refresh token. Tokens rotate on use; a whole `family` is revoked on reuse or logout. */
export interface RefreshTokenAttrs {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  family: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  userAgent?: string;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenAttrs>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    family: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    userAgent: String
  },
  { timestamps: { createdAt: true, updatedAt: false }, autoIndex: false }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ user: 1 });
refreshTokenSchema.index({ family: 1 });

export const RefreshToken = model<RefreshTokenAttrs>('RefreshToken', refreshTokenSchema);
