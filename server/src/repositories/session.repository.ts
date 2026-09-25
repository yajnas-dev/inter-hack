import type { ClientSession } from 'mongoose';
import { RefreshToken } from '../models';

/** Refresh-token rows. Only a SHA-256 hash of each token is stored; the token itself exists only on the client. */

export const create = (row: { user: string; family: string; tokenHash: string; expiresAt: Date; userAgent?: string }) =>
  RefreshToken.create(row);

export const findByHash = (tokenHash: string) => RefreshToken.findOne({ tokenHash }).lean();

/** Marks one token used. Returns false if it was already revoked (a concurrent refresh won the race). */
export const revokeOne = async (id: unknown): Promise<boolean> =>
  (await RefreshToken.updateOne({ _id: id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } })).modifiedCount === 1;

export const revokeFamily = (family: string) =>
  RefreshToken.updateMany({ family, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });

export const revokeAllForUser = (userId: string) =>
  RefreshToken.updateMany({ user: userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });

export const deleteAllForUser = (userId: unknown, session?: ClientSession) => RefreshToken.deleteMany({ user: userId }, { session });
