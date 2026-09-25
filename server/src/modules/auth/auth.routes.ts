import { Router } from 'express';
import { authLimiter } from '../../http/middleware/rateLimit';
import * as auth from './auth.controller';

/** /api/v1/auth: public, rate limited per client IP across all workers. */
export const authRouter = Router();

authRouter.post('/register', authLimiter, auth.register);
authRouter.post('/login', authLimiter, auth.login);
authRouter.post('/refresh', auth.refresh);
authRouter.post('/logout', auth.logout);
