import { Router } from 'express';
import { applyBody, idParam, statusBody } from '@jobportal/shared';
import { handleAuthed } from '../../http/handle';
import { authenticate, requireRole } from '../../http/middleware/auth';
import { getApplicantProfile } from './applicant-profile';
import * as applications from './applications.service';

export const applicationsRouter = Router();
applicationsRouter.use(authenticate);

applicationsRouter.post(
  '/',
  requireRole('JOB_SEEKER'),
  handleAuthed({ body: applyBody }, async ({ user, body, res }) => {
    const application = await applications.apply(user.id, body);
    res.status(201);
    return { application };
  })
);

applicationsRouter.get(
  '/mine',
  requireRole('JOB_SEEKER'),
  handleAuthed({}, async ({ user }) => ({ applications: await applications.listMine(user.id) }))
);

applicationsRouter.get(
  '/:id',
  handleAuthed({ params: idParam }, async ({ user, params }) => ({ application: await applications.getForUser(params.id, user) }))
);

applicationsRouter.get(
  '/:id/applicant',
  requireRole('RECRUITER'),
  handleAuthed({ params: idParam }, ({ user, params }) => getApplicantProfile(params.id, user))
);

applicationsRouter.get(
  '/:id/resume',
  requireRole('RECRUITER'),
  handleAuthed({ params: idParam }, ({ user, params, res }) => applications.streamResume(params.id, user, res))
);

applicationsRouter.patch(
  '/:id/status',
  requireRole('RECRUITER'),
  handleAuthed({ params: idParam, body: statusBody }, async ({ user, params, body }) => ({
    application: await applications.updateStatus(params.id, user, body.status)
  }))
);
