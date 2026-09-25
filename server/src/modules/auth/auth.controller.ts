import type { Request, Response } from 'express';
import { loginBody, refreshBody, registerBody, type AuthSessionDTO } from '@jobportal/shared';
import { env } from '../../config/env';
import { controller } from '../../http/controller';
import { AuthorizationError } from '../../http/errors';
import { created, noContent, ok } from '../../http/respond';
import { parseCookies } from '../../utils/cookies';
import * as auth from './auth.service';

/**
 * Refresh-token transport:
 *  - Browsers (default): httpOnly, SameSite=Strict cookie scoped to /api/v1/auth. JavaScript can never read it,
 *    and cookie-authenticated calls must carry X-Requested-With (a header cross-site forms cannot set).
 *  - Native/mobile clients: send `X-Token-Transport: body`; the token is returned in the JSON body and sent back
 *    in the body of /auth/refresh and /auth/logout. No cookie is involved, so there is nothing to forge.
 */
export const COOKIE_NAME = 'jp_refresh';
const COOKIE_PATH = '/api/v1/auth';

const wantsBodyTransport = (req: Request): boolean => String(req.headers['x-token-transport'] ?? '').toLowerCase() === 'body';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.cookieSecure,
    path: COOKIE_PATH,
    maxAge: env.refreshTokenTtlDays * 86_400_000
  });
}

const clearRefreshCookie = (res: Response): void =>
  void res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH, sameSite: 'strict', secure: env.cookieSecure });

/** Body token (native clients) or cookie (browsers, which must also prove the call is not a cross-site form). */
function presentedRefreshToken(req: Request, bodyToken: string | undefined): string | undefined {
  if (bodyToken) return bodyToken;
  const cookie = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (cookie && !req.headers['x-requested-with']) throw new AuthorizationError('Missing X-Requested-With header', 'CSRF_CHECK_FAILED');
  return cookie;
}

function sessionReply(req: Request, res: Response, session: auth.Session): AuthSessionDTO {
  const body = wantsBodyTransport(req);
  if (!body) setRefreshCookie(res, session.refreshToken);
  return {
    accessToken: session.accessToken,
    tokenType: 'Bearer',
    expiresIn: env.accessTokenTtlSeconds,
    user: session.user,
    ...(body && { refreshToken: session.refreshToken })
  };
}

export const register = controller({ body: registerBody }, async ({ body, req, res }) => {
  const session = await auth.register(body, req.headers['user-agent']);
  return created(sessionReply(req, res, session), '/api/v1/users/me', 'Account created');
});

export const login = controller({ body: loginBody }, async ({ body, req, res }) =>
  ok(sessionReply(req, res, await auth.login(body, req.headers['user-agent'])))
);

export const refresh = controller({ body: refreshBody }, async ({ body, req, res }) => {
  try {
    return ok(sessionReply(req, res, await auth.refresh(presentedRefreshToken(req, body.refreshToken), req.headers['user-agent'])));
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
});

export const logout = controller({ body: refreshBody }, async ({ body, req, res }) => {
  await auth.logout(presentedRefreshToken(req, body.refreshToken));
  clearRefreshCookie(res);
  return noContent();
});
