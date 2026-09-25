import { Router } from 'express';
import { authenticate, requireRole } from '../../http/middleware/auth';
import { aiLimiter } from '../../http/middleware/rateLimit';
import * as matching from '../matching/matching.controller';
import * as jobs from './jobs.controller';

/** /api/v1/jobs */
export const jobsRouter = Router();

// Public (anonymous, cached). "/facets" is declared before "/:id" so it is not read as an id.
jobsRouter.get('/', jobs.search);
jobsRouter.get('/facets', jobs.facets);
jobsRouter.get('/:id', jobs.getOne);
jobsRouter.get('/:id/similar', jobs.similar);

// Recruiter writes; ownership (the job's company) is checked in the service. Admins moderate via /admin.
jobsRouter.post('/', authenticate, requireRole('RECRUITER'), jobs.create);
jobsRouter.patch('/:id', authenticate, requireRole('RECRUITER'), jobs.update);
jobsRouter.delete('/:id', authenticate, requireRole('RECRUITER'), jobs.remove);

// Applicants of one job: the hiring company or an admin.
jobsRouter.get('/:jobId/applications', authenticate, requireRole('RECRUITER', 'ADMIN'), jobs.applicants);

// AI: how well does MY profile/resume fit this job?
jobsRouter.post('/:jobId/match', authenticate, requireRole('JOB_SEEKER'), aiLimiter, matching.matchMeToJob);
