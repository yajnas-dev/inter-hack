import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { env } from './config/env';
import { errorHandler, routeNotFound } from './http/middleware/errorHandler';
import { authLimiter, globalLimiter } from './http/middleware/rateLimit';
import { metricsMiddleware, registry, requestLogger } from './http/middleware/observability';
import { docsRouter } from './docs/swagger';
import { adminRouter } from './modules/admin/admin.routes';
import { applicationsRouter } from './modules/applications/applications.routes';
import { authRouter } from './modules/auth/auth.routes';
import { companiesRouter } from './modules/companies/companies.routes';
import { jobsRouter } from './modules/jobs/jobs.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { recruiterRouter, seekerRouter } from './modules/profiles/profiles.routes';
import { savedRouter } from './modules/saved/saved.routes';

/** Built React app, if present (production: one process serves both API and UI). */
function findClientDist(): string | null {
  const candidates = [path.resolve(process.cwd(), '../client/dist'), path.resolve(process.cwd(), 'client/dist')];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) ?? null;
}

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.set('query parser', 'simple'); // no nested objects: closes ?role[$ne]=x operator injection, cheaper than qs
  app.set('etag', false); // the public cache sets its own; hashing every private response is wasted CPU
  app.disable('x-powered-by');

  app.use(requestLogger);
  if (env.enableMetrics) app.use(metricsMiddleware);
  app.use(helmet());
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', globalLimiter);

  // Liveness: the process is up. Readiness: it can serve traffic (database connected).
  app.get('/api/health', (_req, res) => void res.json({ status: 'ok' }));
  app.get('/api/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'db_unavailable' });
  });
  if (env.enableMetrics) {
    app.get('/api/metrics', async (_req, res) => {
      res.type(registry.contentType).send(await registry.metrics());
    });
  }

  if (env.enableDocs) app.use('/api', docsRouter());

  app.use('/api/auth', authLimiter, authRouter);
  // Saved jobs live under /api/seekers/me/saved; mounted first so the seeker router never has to know about them.
  app.use('/api/seekers/me/saved', savedRouter);
  app.use('/api/seekers', seekerRouter);
  app.use('/api/recruiters', recruiterRouter);
  app.use('/api/companies', companiesRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', routeNotFound);

  const clientDist = env.serveClient && !env.isTest ? findClientDist() : null;
  if (clientDist) {
    // Hashed build assets never change: cache forever. index.html must always revalidate.
    app.use('/assets', express.static(path.join(clientDist, 'assets'), { immutable: true, maxAge: '1y', index: false }));
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    app.use(routeNotFound);
  }

  app.use(errorHandler);
  return app;
}

export const app = createApp();
