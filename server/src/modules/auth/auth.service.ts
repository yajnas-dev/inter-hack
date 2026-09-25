import crypto from 'node:crypto';
import type { LoginBody, RegisterBody, UserDTO } from '@jobportal/shared';
import { env } from '../../config/env';
import { withTransaction } from '../../infra/db';
import { events } from '../../infra/events';
import { logger } from '../../infra/logger';
import { AuthenticationError, AuthorizationError, ConflictError } from '../../http/errors';
import { signAccessToken } from '../../http/middleware/auth';
import * as profiles from '../../repositories/profile.repository';
import * as sessions from '../../repositories/session.repository';
import * as users from '../../repositories/user.repository';
import type { UserRow } from '../../repositories/user.repository';
import { comparePassword, hashPassword, timingSafeDummyCompare } from '../../utils/password';
import { presentUser } from '../../utils/presenters';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: UserDTO;
}

/** Concurrent tabs may present the same refresh token within this window without it counting as theft. */
const REUSE_GRACE_MS = 10_000;

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

async function issueRefreshToken(userId: string, family: string, userAgent?: string): Promise<string> {
  // 256 bits of randomness: unguessable, so it needs no signature; only its hash is stored.
  const token = crypto.randomBytes(32).toString('base64url');
  await sessions.create({
    user: userId,
    family,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + env.refreshTokenTtlDays * 86_400_000),
    userAgent: userAgent?.slice(0, 200)
  });
  return token;
}

async function startSession(user: UserRow, userAgent?: string, family: string = crypto.randomUUID()): Promise<Session> {
  const dto = presentUser(user);
  return {
    accessToken: signAccessToken({ id: dto.id, role: dto.role }),
    refreshToken: await issueRefreshToken(dto.id, family, userAgent),
    user: dto
  };
}

/** Self-registration creates the account and its (empty) role profile atomically. ADMIN cannot self-register. */
export async function register(body: RegisterBody, userAgent?: string): Promise<Session> {
  if (await users.existsByEmail(body.email)) throw new ConflictError('An account with this email already exists', 'EMAIL_TAKEN');
  const password = await hashPassword(body.password);

  // The unique email index still decides races between two simultaneous registrations (-> 409 EMAIL_TAKEN).
  const user = await withTransaction(async (session) => {
    const created = await users.create({ name: body.name, email: body.email, password, role: body.role }, session);
    if (body.role === 'JOB_SEEKER') await profiles.createSeeker(created._id, session);
    else await profiles.createRecruiter(created._id, session);
    return created;
  });

  logger.info({ userId: String(user._id), role: user.role }, 'user registered');
  return startSession(user, userAgent);
}

/**
 * Same error and (roughly) the same time for "no such email" and "wrong password", so the endpoint cannot be
 * used to discover which emails have accounts.
 */
export async function login(body: LoginBody, userAgent?: string): Promise<Session> {
  const user = await users.findByEmailWithPassword(body.email);
  const valid = user ? await comparePassword(body.password, user.password) : await timingSafeDummyCompare(body.password);
  if (!user || !valid) {
    logger.warn({ email: body.email }, 'failed login');
    throw new AuthenticationError('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  if (!user.isActive) throw new AuthorizationError('This account has been deactivated', 'ACCOUNT_DISABLED');

  const { password: _password, ...row } = user;
  void users.update(String(user._id), { lastLoginAt: new Date() }).catch(() => undefined);
  return startSession(row, userAgent);
}

/**
 * Rotates the refresh token: each token works once. Presenting an already-rotated token outside the grace
 * window means it was stolen and replayed, so the whole family (every token descended from that login) is revoked.
 */
export async function refresh(presented: string | undefined, userAgent?: string): Promise<Session> {
  if (!presented) throw new AuthenticationError('No active session', 'SESSION_EXPIRED');

  const row = await sessions.findByHash(sha256(presented));
  if (!row) throw new AuthenticationError('Session is invalid', 'SESSION_EXPIRED');

  if (row.revokedAt) {
    if (Date.now() - row.revokedAt.getTime() > REUSE_GRACE_MS) {
      await sessions.revokeFamily(row.family);
      logger.warn({ userId: String(row.user), family: row.family }, 'refresh token reuse detected; session family revoked');
    }
    throw new AuthenticationError('Session has expired', 'SESSION_EXPIRED');
  }
  if (row.expiresAt.getTime() <= Date.now()) throw new AuthenticationError('Session has expired', 'SESSION_EXPIRED');

  const user = await users.findById(String(row.user));
  if (!user?.isActive) {
    await sessions.revokeFamily(row.family);
    throw new AuthenticationError('Account is deactivated or no longer exists', 'ACCOUNT_DISABLED', false);
  }

  await sessions.revokeOne(row._id);
  return startSession(user, userAgent, row.family);
}

/** Real logout: the refresh token and every token minted from it stop working server-side. */
export async function logout(presented: string | undefined): Promise<void> {
  if (!presented) return;
  const row = await sessions.findByHash(sha256(presented));
  if (row) await sessions.revokeFamily(row.family);
}

/** Ends every session of a user: refresh tokens revoked and outstanding access tokens rejected from now on. */
export async function revokeAllSessions(userId: string): Promise<void> {
  // Whole-second precision to match the JWT iat claim.
  await users.update(userId, { sessionsValidAfter: new Date(Math.floor(Date.now() / 1000) * 1000) });
  await sessions.revokeAllForUser(userId);
  events.emit('user.sessionsRevoked', { userId });
}
