import listEndpoints from 'express-list-endpoints';
import { connect, closeDatabase } from './setup';
import { app, request } from './helpers';
import { routes, buildOpenApi } from '../src/docs/openapi';

// The OpenAPI document is generated from `routes`; this keeps it honest against the real routers.
const norm = (method: string, p: string) => `${method.toUpperCase()} ${p.replace(/:(\w+)/g, ':x').replace(/\{(\w+)\}/g, ':x')}`;

beforeAll(async () => connect());
afterAll(async () => closeDatabase());

describe('API contract', () => {
  const implemented = new Set<string>();
  for (const e of listEndpoints(app)) {
    if (!e.path.startsWith('/api/')) continue;
    for (const m of e.methods) implemented.add(norm(m, e.path.replace(/^\/api/, '')));
  }
  const documented = new Set(routes.map((r) => norm(r.method, r.path)));
  // Infrastructure endpoints are intentionally not part of the product API.
  const infrastructure = new Set(['GET /health', 'GET /ready', 'GET /metrics', 'GET /openapi.json', 'GET /docs', 'GET /docs/init.js']);

  test('every documented route exists', () => {
    const missing = [...documented].filter((d) => !implemented.has(d));
    expect(missing).toEqual([]);
  });

  test('every implemented route is documented', () => {
    const undocumented = [...implemented].filter((i) => !documented.has(i) && !infrastructure.has(i) && !i.startsWith('GET /docs/assets'));
    expect(undocumented).toEqual([]);
  });

  test('protected routes reject anonymous callers and public routes do not', async () => {
    for (const r of routes) {
      if (r.path === '/auth/refresh' || r.path === '/auth/logout') continue;
      const url = `/api${r.path.replace(/:(\w+)/g, '000000000000000000000000')}`;
      const res = await request(app)[r.method](url);
      if (r.roles) expect([r.method, r.path, res.status]).toEqual([r.method, r.path, 401]);
      else expect([r.method, r.path, res.status === 401 || res.status === 403]).toEqual([r.method, r.path, false]);
    }
  });

  test('the generated OpenAPI document is well formed and covers every route', () => {
    const doc = buildOpenApi() as { openapi: string; paths: Record<string, Record<string, unknown>> };
    expect(doc.openapi).toMatch(/^3\./);
    const operations = Object.values(doc.paths).reduce((n, p) => n + Object.keys(p).length, 0);
    expect(operations).toBe(routes.length);
    expect(JSON.stringify(doc.paths['/api/jobs']!.get)).toContain('employmentType');
    expect(JSON.stringify(doc.paths['/api/auth/register']!.post)).toContain('JOB_SEEKER');
  });

  test('docs are served in development mode', async () => {
    const res = await request(app).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.info.title).toBe('Job Portal API');
    expect((await request(app).get('/api/docs')).status).toBe(200);
    expect((await request(app).get('/api/docs/assets/swagger-ui-bundle.js')).status).toBe(200);
  });
});
