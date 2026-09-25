import path from 'node:path';
import express, { Router } from 'express';
import { buildOpenApi } from './openapi';

const INIT_SCRIPT = `window.onload = () => { window.ui = SwaggerUIBundle({ url: '/api/v1/openapi.json', dom_id: '#swagger-ui', deepLinking: true, persistAuthorization: true }); };`;

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>Job Portal API</title>
<link rel="stylesheet" href="/api/v1/docs/assets/swagger-ui.css"/></head>
<body><div id="swagger-ui"></div>
<script src="/api/v1/docs/assets/swagger-ui-bundle.js"></script>
<script src="/api/v1/docs/init.js"></script></body></html>`;

/**
 * Interactive docs at /api/v1/docs (spec at /api/v1/openapi.json) (development by default; ENABLE_DOCS=true to expose elsewhere).
 * Swagger UI is self-hosted from node_modules, so the strict Content-Security-Policy stays intact.
 */
export function docsRouter(): Router {
  const router = Router();
  const spec = buildOpenApi();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const assets = path.dirname(require.resolve('swagger-ui-dist/package.json'));

  router.get('/openapi.json', (_req, res) => void res.json(spec));
  router.get('/docs/init.js', (_req, res) => void res.type('application/javascript').send(INIT_SCRIPT));
  router.use('/docs/assets', express.static(assets, { index: false }));
  router.get('/docs', (_req, res) => void res.type('html').send(PAGE));
  return router;
}
