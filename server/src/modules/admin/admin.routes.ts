import { Router } from 'express';
import { adminUsersQuery, idParam, pagedListQuery, setActiveBody } from '@jobportal/shared';
import { handleAuthed } from '../../http/handle';
import { authenticate, requireRole } from '../../http/middleware/auth';
import * as admin from './admin.service';

export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('ADMIN'));

const message = (text: string) => ({ message: text });

adminRouter.get(
  '/users',
  handleAuthed({ query: adminUsersQuery }, ({ query }) => admin.listUsers(query.role, query.page, query.limit))
);
adminRouter.patch(
  '/users/:id/status',
  handleAuthed({ params: idParam, body: setActiveBody }, async ({ params, body }) => ({
    user: await admin.setUserActive(params.id, body.isActive)
  }))
);
adminRouter.delete(
  '/users/:id',
  handleAuthed({ params: idParam }, async ({ user, params }) => {
    await admin.deleteUser(params.id, user.id);
    return message('User deleted');
  })
);

adminRouter.get(
  '/companies',
  handleAuthed({ query: pagedListQuery }, ({ query }) => admin.listCompanies(query.page, query.limit))
);
adminRouter.delete(
  '/companies/:id',
  handleAuthed({ params: idParam }, async ({ params }) => {
    await admin.deleteCompany(params.id);
    return message('Company deleted');
  })
);

adminRouter.get(
  '/jobs',
  handleAuthed({ query: pagedListQuery }, ({ query }) => admin.listAllJobs(query.page, query.limit))
);
adminRouter.delete(
  '/jobs/:id',
  handleAuthed({ params: idParam }, async ({ params }) => {
    await admin.deleteAnyJob(params.id);
    return message('Job deleted');
  })
);

adminRouter.get(
  '/applications',
  handleAuthed({ query: pagedListQuery }, ({ query }) => admin.listAllApplications(query.page, query.limit))
);

adminRouter.get(
  '/reports/summary',
  handleAuthed({}, () => admin.summary())
);
adminRouter.get(
  '/reports/applications-by-status',
  handleAuthed({}, () => admin.applicationsByStatus())
);
adminRouter.get(
  '/reports/applications-over-time',
  handleAuthed({}, () => admin.applicationsOverTime())
);
adminRouter.get(
  '/reports/top-jobs',
  handleAuthed({}, () => admin.topJobs())
);
adminRouter.get(
  '/reports/top-companies',
  handleAuthed({}, () => admin.topCompanies())
);
