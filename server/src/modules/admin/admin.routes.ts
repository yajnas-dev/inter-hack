import { Router } from 'express';
import { authenticate, requireRole } from '../../http/middleware/auth';
import * as admin from './admin.controller';

/** /api/v1/admin: platform management. The whole router is ADMIN-only. */
export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('ADMIN'));

adminRouter.get('/users', admin.listUsers);
adminRouter.get('/users/:id', admin.getUser);
adminRouter.patch('/users/:id', admin.updateUser);
adminRouter.delete('/users/:id', admin.deleteUser);

adminRouter.get('/companies', admin.listCompanies);
adminRouter.delete('/companies/:id', admin.deleteCompany);

adminRouter.get('/jobs', admin.listJobs);
adminRouter.patch('/jobs/:id', admin.updateJob);
adminRouter.delete('/jobs/:id', admin.deleteJob);

adminRouter.get('/applications', admin.listApplications);
