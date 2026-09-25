import crypto from 'node:crypto';
import type { UserDTO, LoginBody, RegisterBody } from '@jobportal/shared';
import { env } from '../../config/env';
import { withTransaction } from '../../infra/db';
import { events } from '../../infra/events';
import { forbidden, conflict, notFound, unauthorized } from '../../http/errors';
import { signAccessToken } from '../../http/middleware/auth';
import { JobSeekerProfile, RecruiterProfile, RefreshToken, User, type UserAttrs } from '../../models';
import { comparePassword, hashPassword } from '../../utils/password';
import { toUserDTO } from '../../utils/presenters';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: UserDTO;
}

/** Concurrent tabs may present the same refresh token within this window without it counting as theft. */
const REUSE_GRACE_MS = 10_000;

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

async function issueRefreshToken(userId: string, family: string, userAgent?: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await RefreshToken.create({
    user: userId,
    family,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + env.refreshTokenTtlDays * 86_400_000),
    userAgent: userAgent?.slice(0, 200)
  });
  return token;
}

async function startSession(
  user: Pick<UserAttrs, '_id' | 'name' | 'email' | 'role' | 'isActive' | 'createdAt'>,
  userAgent?: string
): Promise<Session> {
  const dto = toUserDTO(user);
  return {
    accessToken: signAccessToken({ id: dto.id, role: dto.role }),
    refreshToken: await issueRefreshToken(dto.id, crypto.randomUUID(), userAgent),
    user: dto
  };
}

export async function register(body: RegisterBody, userAgent?: string): Promise<Session> {
  if (await User.exists({ email: body.email })) throw conflict('An account with this email already exists');
  const password = await hashPassword(body.password);

  // The unique email index is the source of truth for races; a 11000 error maps to 409 in errorHandler.
  const user = await withTransaction(async (session) => {
    const [created] = await User.create([{ name: body.name, email: body.email, password, role: body.role }], { session });
    if (body.role === 'JOB_SEEKER') await JobSeekerProfile.create([{ user: created!._id }], { session });
    else await RecruiterProfile.create([{ user: created!._id }], { session });
    return created!;
  });

  return startSession(user, userAgent);
}

export async function login(body: LoginBody, userAgent?: string): Promise<Session> {
  const user = await User.findOne({ email: body.email }).select('+password').lean();
  if (!user || !(await comparePassword(body.password, user.password))) throw unauthorized('Invalid email or password');
  if (!user.isActive) throw forbidden('This account has been deactivated');
  return startSession(user, userAgent);
}

/** Rotates the refresh token. Presenting an already-rotated token revokes the whole family (theft). */
export async function refresh(presented: string | undefined, userAgent?: string): Promise<Session> {
  if (!presented) throw unauthorized('No active session');

  const row = await RefreshToken.findOne({ tokenHash: sha256(presented) }).lean();
  if (!row) throw unauthorized('Invalid session');

  const now = Date.now();
  if (row.revokedAt) {
    if (now - row.revokedAt.getTime() > REUSE_GRACE_MS) await revokeFamily(row.family);
    throw unauthorized('Session expired');
  }
  if (row.expiresAt.getTime() <= now) throw unauthorized('Session expired');

  const user = await User.findById(row.user).lean();
  if (!user?.isActive) {
    await revokeFamily(row.family);
    throw unauthorized('Account is deactivated or no longer exists');
  }

  await RefreshToken.updateOne({ _id: row._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  const dto = toUserDTO(user);
  return {
    accessToken: signAccessToken({ id: dto.id, role: dto.role }),
    refreshToken: await issueRefreshToken(dto.id, row.family, userAgent),
    user: dto
  };
}

const revokeFamily = (family: string) =>
  RefreshToken.updateMany({ family, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });

/** Real logout: the refresh token (and every token minted from it) stops working server-side. */
export async function logout(presented: string | undefined): Promise<void> {
  if (!presented) return;
  const row = await RefreshToken.findOne({ tokenHash: sha256(presented) })
    .select('family')
    .lean();
  if (row) await revokeFamily(row.family);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await RefreshToken.updateMany({ user: userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  events.emit('user.deactivated', { userId });
}

export async function me(userId: string): Promise<UserDTO> {
  const user = await User.findById(userId).lean();
  if (!user) throw notFound('User not found');
  return toUserDTO(user);
}
