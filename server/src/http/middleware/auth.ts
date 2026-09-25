import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@jobportal/shared';
import { env } from '../../config/env';
import { User } from '../../models';
import { createTtlCache } from '../../infra/cache/ttl';
import { events } from '../../infra/events';
import { forbidden, unauthorized } from '../errors';

interface AccessPayload {
  id: string;
  role: Role;
  exp: number;
}

export function signAccessToken(user: { id: string; role: Role }): string {
  return jwt.sign({ id: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: env.accessTokenTtl as SignOptions['expiresIn']
  });
}

// Deactivation takes effect within ~1 minute (immediately on the worker that handles it) without a
// DB hit on every request; verified tokens are cached so repeat requests skip the HMAC + JSON parse.
const activeCache = createTtlCache<boolean>(60 * 1000, 5000);
const tokenCache = createTtlCache<AccessPayload>(30 * 1000, 5000);

export const invalidateUserCache = (userId: string): void => activeCache.delete(userId);
events.on('user.deactivated', ({ userId }) => invalidateUserCache(userId));

function verifyCached(token: string): AccessPayload {
  const hit = tokenCache.get(token);
  if (hit && hit.exp * 1000 > Date.now()) return hit;
  const payload = jwt.verify(token, env.jwtSecret) as AccessPayload;
  tokenCache.set(token, payload);
  return payload;
}

async function isUserActive(id: string): Promise<boolean> {
  const cached = activeCache.get(id);
  if (cached !== undefined) return cached;
  const user = await User.findById(id).select('isActive').lean();
  const active = Boolean(user?.isActive);
  activeCache.set(id, active);
  return active;
}

/** Requires a valid access token for an active account; sets `req.user`. */
export const authenticate: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());

  try {
    const payload = verifyCached(token);
    if (!(await isUserActive(payload.id))) return next(unauthorized('Account is deactivated or no longer exists'));
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch (err) {
    const name = (err as Error).name;
    next(name === 'JsonWebTokenError' || name === 'TokenExpiredError' ? unauthorized('Invalid or expired token') : err);
  }
};

/** Server-side role guard. UI hiding is never the security boundary. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
