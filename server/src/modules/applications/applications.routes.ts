import { Router } from 'express';
import { authenticate, requireRole } from '../../http/middleware/auth';
import { aiLimiter } from '../../http/middleware/rateLimit';
import * as matching from '../matching/matching.controller';
import * as applications from './applications.controller';

/** /api/v1/applications. Every route requires a session; object access is decided per application. */
export const applicationsRouter = Router();
applicationsRouter.use(authenticate);

applicationsRouter.post('/', requireRole('JOB_SEEKER'), applications.apply);
applicationsRouter.get('/', applications.list);
applicationsRouter.get('/:id', applications.getOne);
applicationsRouter.patch('/:id', requireRole('RECRUITER', 'ADMIN'), applications.update);

applicationsRouter.get('/:id/applicant', requireRole('RECRUITER', 'ADMIN'), applications.applicant);
applicationsRouter.get('/:id/notes', requireRole('RECRUITER', 'ADMIN'), applications.listNotes);
applicationsRouter.post('/:id/notes', requireRole('RECRUITER', 'ADMIN'), applications.addNote);

// AI: how well does this applicant (and the resume they sent) fit the job?
applicationsRouter.post('/:id/match', requireRole('RECRUITER', 'ADMIN'), aiLimiter, matching.matchApplication);
