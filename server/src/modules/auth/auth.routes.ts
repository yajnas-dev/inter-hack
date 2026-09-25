import { Router, type Request, type Response } from 'express';
import { loginBody, registerBody } from '@jobportal/shared';
import { env } from '../../config/env';
import { handle, handleAuthed } from '../../http/handle';
import { badRequest } from '../../http/errors';
import { authenticate } from '../../http/middleware/auth';
import { parseCookies } from '../../utils/cookies';
import * as auth from './auth.service';

const COOKIE_NAME = 'jp_refresh';
const COOKIE_PATH = '/api/auth';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    path: COOKIE_PATH,
    maxAge: env.refreshTokenTtlDays * 86_400_000
  });
}

const clearRefreshCookie = (res: Response): void => void res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
const refreshTokenFrom = (req: Request): string | undefined => parseCookies(req.headers.cookie)[COOKIE_NAME];

/** Cookie-authenticated endpoints must come from our own script (blocks cross-site form posts). */
function requireXhr(req: Request): void {
  if (!req.headers['x-requested-with']) throw badRequest('Missing X-Requested-With header');
}

// `token` is the short-lived access token (kept in memory by the client); the refresh token is httpOnly.
const sessionBody = (s: auth.Session) => ({ token: s.accessToken, user: s.user });

export const authRouter = Router();

authRouter.post(
  '/register',
  handle({ body: registerBody }, async ({ body, req, res }) => {
    const session = await auth.register(body, req.headers['user-agent']);
    setRefreshCookie(res, session.refreshToken);
    res.status(201);
    return sessionBody(session);
  })
);

authRouter.post(
  '/login',
  handle({ body: loginBody }, async ({ body, req, res }) => {
    const session = await auth.login(body, req.headers['user-agent']);
    setRefreshCookie(res, session.refreshToken);
    return sessionBody(session);
  })
);

authRouter.post(
  '/refresh',
  handle({}, async ({ req, res }) => {
    requireXhr(req);
    try {
      const session = await auth.refresh(refreshTokenFrom(req), req.headers['user-agent']);
      setRefreshCookie(res, session.refreshToken);
      return sessionBody(session);
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  })
);

authRouter.post(
  '/logout',
  handle({}, async ({ req, res }) => {
    requireXhr(req);
    await auth.logout(refreshTokenFrom(req));
    clearRefreshCookie(res);
    return { message: 'Logged out successfully' };
  })
);

authRouter.get(
  '/me',
  authenticate,
  handleAuthed({}, async ({ user }) => ({ user: await auth.me(user.id) }))
);
