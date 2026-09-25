import { Router } from 'express';
import { authenticate, requireRole } from '../../http/middleware/auth';
import * as reports from './reports.controller';

/** /api/v1/reports: platform analytics, ADMIN-only. */
export const reportsRouter = Router();
reportsRouter.use(authenticate, requireRole('ADMIN'));

reportsRouter.get('/summary', reports.summary);
reportsRouter.get('/applications-over-time', reports.applicationsOverTime);
reportsRouter.get('/top-jobs', reports.topJobs);
reportsRouter.get('/top-companies', reports.topCompanies);
