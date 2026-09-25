import { Router } from 'express';
import { jobIdParam, pagedListQuery } from '@jobportal/shared';
import { handleAuthed } from '../../http/handle';
import { authenticate, requireRole } from '../../http/middleware/auth';
import * as saved from './saved.service';

/** Mounted at /api/seekers/me/saved. */
export const savedRouter = Router();
savedRouter.use(authenticate, requireRole('JOB_SEEKER'));

savedRouter.get(
  '/',
  handleAuthed({ query: pagedListQuery }, ({ user, query }) => saved.listSaved(user.id, query.page, query.limit))
);

savedRouter.get(
  '/ids',
  handleAuthed({}, async ({ user }) => ({ ids: await saved.savedIds(user.id) }))
);

savedRouter.put(
  '/:jobId',
  handleAuthed({ params: jobIdParam }, async ({ user, params }) => {
    await saved.save(user.id, params.jobId);
    return { saved: true };
  })
);

savedRouter.delete(
  '/:jobId',
  handleAuthed({ params: jobIdParam }, async ({ user, params }) => {
    await saved.unsave(user.id, params.jobId);
    return { saved: false };
  })
);
