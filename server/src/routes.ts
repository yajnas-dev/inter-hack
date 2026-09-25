import { Router } from 'express';
import { env } from './config/env';
import { docsRouter } from './docs/swagger';
import { adminRouter } from './modules/admin/admin.routes';
import { applicationsRouter } from './modules/applications/applications.routes';
import { authRouter } from './modules/auth/auth.routes';
import { companiesRouter } from './modules/companies/companies.routes';
import { healthRouter } from './modules/health/health.routes';
import { jobsRouter } from './modules/jobs/jobs.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { resumesRouter } from './modules/resumes/resumes.routes';
import { usersRouter } from './modules/users/users.routes';

/** Version 1 of the public API, mounted at /api/v1. A breaking change would ship as /api/v2 alongside it. */
export function apiV1(): Router {
  const v1 = Router();
  v1.use('/health', healthRouter);
  if (env.enableDocs) v1.use(docsRouter());

  v1.use('/auth', authRouter);
  v1.use('/users', usersRouter);
  v1.use('/companies', companiesRouter);
  v1.use('/jobs', jobsRouter);
  v1.use('/applications', applicationsRouter);
  v1.use('/resumes', resumesRouter);
  v1.use('/notifications', notificationsRouter);
  v1.use('/admin', adminRouter);
  v1.use('/reports', reportsRouter);
  return v1;
}
