import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { UnsupportedMediaTypeError } from './http/errors';
import { errorHandler, routeNotFound } from './http/middleware/errorHandler';
import { metricsMiddleware, registry, requestLogger } from './http/middleware/observability';
import { globalLimiter } from './http/middleware/rateLimit';
import { apiV1 } from './routes';

/** Built React app, if present (production: one process serves both API and UI). */
function findClientDist(): string | null {
  const candidates = [path.resolve(process.cwd(), '../client/dist'), path.resolve(process.cwd(), 'client/dist')];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) ?? null;
}

/** Bodies must be JSON (or multipart for uploads): anything else is 415 rather than a confusing validation error. */
const requireKnownContentType: RequestHandler = (req, _res, next) => {
  const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined;
  if (!hasBody || !['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  if (req.is('application/json') || req.is('multipart/form-data')) return next();
  next(new UnsupportedMediaTypeError('Send the request body as application/json (or multipart/form-data for file uploads)'));
};

/** API responses are private by default; the anonymous job cache opts in to public caching explicitly. */
const noStore: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

export function createApp(): express.Express {
  const app = express();

  // Only trust X-Forwarded-For from a known number of proxies: trusting it blindly lets any client spoof its IP
  // and walk around the per-IP rate limits.
  app.set('trust proxy', env.trustProxy);
  app.set('query parser', 'simple'); // flat strings only: no ?role[$ne]=x operator injection
  app.set('etag', false); // the public cache sets its own; hashing every private response is wasted CPU
  app.disable('x-powered-by');

  app.use(requestLogger);
  if (env.enableMetrics) app.use(metricsMiddleware);
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'Location', 'Retry-After', 'RateLimit', 'RateLimit-Policy', 'Content-Disposition']
    })
  );
  app.use(compression());

  const api = express.Router();
  api.use(noStore, globalLimiter, requireKnownContentType, express.json({ limit: '100kb', strict: true }));
  api.use('/v1', apiV1());
  if (env.enableMetrics) api.get('/metrics', async (_req, res) => void res.type(registry.contentType).send(await registry.metrics()));
  api.use(routeNotFound);
  app.use('/api', api);

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
