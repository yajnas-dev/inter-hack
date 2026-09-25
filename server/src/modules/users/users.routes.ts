import { Router } from 'express';
import { authenticate, requireRole } from '../../http/middleware/auth';
import * as users from './users.controller';

/** /api/v1/users/me: everything scoped to the signed-in account. There is no /users/:id for non-admins. */
export const usersRouter = Router();
usersRouter.use(authenticate);

usersRouter.get('/me', users.getMe);
usersRouter.patch('/me', users.updateMe);
usersRouter.put('/me/password', users.changePassword);

usersRouter.get('/me/profile', users.getProfile);
usersRouter.patch('/me/profile', requireRole('JOB_SEEKER', 'RECRUITER'), users.updateProfile);

usersRouter.get('/me/jobs', requireRole('RECRUITER'), users.myJobs);
usersRouter.get('/me/dashboard', requireRole('RECRUITER'), users.dashboard);

usersRouter.get('/me/saved-jobs', requireRole('JOB_SEEKER'), users.savedJobs);
usersRouter.get('/me/saved-jobs/ids', requireRole('JOB_SEEKER'), users.savedJobIds);
usersRouter.put('/me/saved-jobs/:jobId', requireRole('JOB_SEEKER'), users.saveJob);
usersRouter.delete('/me/saved-jobs/:jobId', requireRole('JOB_SEEKER'), users.unsaveJob);
