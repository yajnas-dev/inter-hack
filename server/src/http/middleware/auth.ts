import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { ROLES, type Role } from '@jobportal/shared';
import { env } from '../../config/env';
import { createTtlCache } from '../../infra/cache/ttl';
import { events } from '../../infra/events';
import * as users from '../../repositories/user.repository';
import { AuthenticationError, AuthorizationError } from '../errors';

/**
 * Access tokens: HS256 JWTs, 15 minutes by default, claims { sub, role, iat, exp, iss, aud }.
 * They are held in memory by browsers (never localStorage); refresh tokens are separate, opaque and rotated.
 */
interface AccessClaims {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
}

const VERIFY_OPTIONS: jwt.VerifyOptions = { algorithms: ['HS256'], issuer: env.jwtIssuer, audience: env.jwtAudience };

export function signAccessToken(user: { id: string; role: Role }): string {
  return jwt.sign({ role: user.role }, env.jwtSecret, {
    algorithm: 'HS256',
    subject: user.id,
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
    expiresIn: env.accessTokenTtlSeconds
  });
}

// Account state is cached briefly so an authenticated request does not cost a database read. Deactivation,
// deletion and password changes invalidate the entry immediately on the worker that handled them (and within
// the TTL on other workers).
interface AccountState {
  active: boolean;
  /** Tokens issued before this instant (ms) are rejected: set on password change, deactivation, "log out everywhere". */
  validAfter: number;
}
const accountCache = createTtlCache<AccountState>(30 * 1000, 10_000);
const tokenCache = createTtlCache<AccessClaims>(30 * 1000, 10_000);

export const invalidateAccountCache = (userId: string): void => accountCache.delete(userId);
events.on('user.sessionsRevoked', ({ userId }) => invalidateAccountCache(userId));

function verify(token: string): AccessClaims {
  const hit = tokenCache.get(token);
  if (hit && hit.exp * 1000 > Date.now()) return hit;
  let claims: jwt.JwtPayload;
  try {
    claims = jwt.verify(token, env.jwtSecret, VERIFY_OPTIONS) as jwt.JwtPayload;
  } catch (err) {
    if ((err as Error).name === 'TokenExpiredError') throw new AuthenticationError('Access token has expired', 'TOKEN_EXPIRED');
    throw new AuthenticationError('Access token is invalid', 'INVALID_TOKEN');
  }
  if (typeof claims.sub !== 'string' || !(ROLES as readonly string[]).includes(claims.role) || typeof claims.iat !== 'number') {
    throw new AuthenticationError('Access token is invalid', 'INVALID_TOKEN');
  }
  const verified: AccessClaims = { sub: claims.sub, role: claims.role, iat: claims.iat, exp: claims.exp ?? 0 };
  tokenCache.set(token, verified);
  return verified;
}

async function accountState(userId: string): Promise<AccountState> {
  const cached = accountCache.get(userId);
  if (cached) return cached;
  const user = await users.findAuthState(userId);
  const state = { active: Boolean(user?.isActive), validAfter: user?.sessionsValidAfter?.getTime() ?? 0 };
  accountCache.set(userId, state);
  return state;
}

/** Requires `Authorization: Bearer <access token>` for an active account; sets `req.user`. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header) throw new AuthenticationError();
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token)
      throw new AuthenticationError('Authorization header must be "Bearer <token>"', 'INVALID_TOKEN');

    const claims = verify(token);
    const state = await accountState(claims.sub);
    if (!state.active) throw new AuthenticationError('Account is deactivated or no longer exists', 'ACCOUNT_DISABLED');
    // validAfter is stored at whole-second precision to match iat.
    if (claims.iat * 1000 < state.validAfter)
      throw new AuthenticationError('Session has been revoked, please sign in again', 'TOKEN_EXPIRED');

    req.user = { id: claims.sub, role: claims.role };
    next();
  } catch (err) {
    next(err);
  }
};

/** Server-side role guard (RBAC). Hiding UI is never the security boundary. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new AuthenticationError());
    if (!roles.includes(req.user.role)) return next(new AuthorizationError(`This action requires the ${roles.join(' or ')} role`));
    next();
  };
