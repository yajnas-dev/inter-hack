import { Router } from 'express';
import { authenticate, requireRole } from '../../http/middleware/auth';
import { resumeUpload } from '../../http/middleware/upload';
import * as resumes from './resumes.controller';

/**
 * /api/v1/resumes. Private files: upload/list/delete are the owner's; reading metadata or the file is allowed to
 * the owner, admins, and recruiters of a company that received that resume in an application.
 */
export const resumesRouter = Router();
resumesRouter.use(authenticate);

resumesRouter.post('/', requireRole('JOB_SEEKER'), resumeUpload, resumes.upload);
resumesRouter.get('/', requireRole('JOB_SEEKER'), resumes.listMine);
resumesRouter.get('/:id', resumes.getOne);
resumesRouter.get('/:id/file', resumes.download);
resumesRouter.delete('/:id', requireRole('JOB_SEEKER'), resumes.remove);
