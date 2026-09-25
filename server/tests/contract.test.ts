import listEndpoints from 'express-list-endpoints';
import { buildOpenApi, routes } from '../src/docs/openapi';
import { app, request } from './helpers';
import { closeDatabase, connect } from './setup';

// The OpenAPI document is generated from `routes`; this keeps it honest against the real routers.
const norm = (method: string, p: string) => `${method.toUpperCase()} ${p.replace(/:(\w+)/g, ':x').replace(/\{(\w+)\}/g, ':x')}`;

beforeAll(connect);
afterAll(closeDatabase);

describe('API contract', () => {
  const implemented = new Set<string>();
  for (const e of listEndpoints(app)) {
    if (!e.path.startsWith('/api/v1/')) continue;
    for (const m of e.methods) implemented.add(norm(m, e.path.replace(/^\/api\/v1/, '')));
  }
  const documented = new Set(routes.map((r) => norm(r.method, r.path)));
  const infrastructure = new Set(['GET /openapi.json', 'GET /docs', 'GET /docs/init.js']);

  test('every documented route exists', () => {
    expect([...documented].filter((d) => !implemented.has(d))).toEqual([]);
  });

  test('every implemented route is documented', () => {
    const undocumented = [...implemented].filter((i) => !documented.has(i) && !infrastructure.has(i) && !i.startsWith('GET /docs/assets'));
    expect(undocumented).toEqual([]);
  });

  test('protected routes reject anonymous callers with 401; public routes never do', async () => {
    for (const r of routes) {
      if (r.path === '/auth/refresh' || r.path === '/auth/logout') continue;
      const url = `/api/v1${r.path.replace(/:(\w+)/g, '000000000000000000000000')}`;
      const res = await request(app)[r.method](url);
      if (r.roles) expect([r.method, r.path, res.status]).toEqual([r.method, r.path, 401]);
      else expect([r.method, r.path, res.status === 401 || res.status === 403]).toEqual([r.method, r.path, false]);
    }
  });

  test('every JSON response uses the envelope', async () => {
    for (const r of routes.filter((x) => x.method === 'get' && !x.path.includes(':'))) {
      const res = await request(app).get(`/api/v1${r.path}`);
      expect([r.path, typeof res.body.success]).toEqual([r.path, 'boolean']);
      if (res.body.success) expect(res.body).toHaveProperty('data');
      else expect(res.body.error).toMatchObject({ code: expect.any(String), message: expect.any(String) });
    }
  });

  test('the generated OpenAPI document is well formed and covers every route', () => {
    const doc = buildOpenApi() as { openapi: string; paths: Record<string, Record<string, { responses: Record<string, unknown> }>> };
    expect(doc.openapi).toMatch(/^3\./);
    const operations = Object.values(doc.paths).reduce((n, p) => n + Object.keys(p).length, 0);
    expect(operations).toBe(routes.length);
    expect(JSON.stringify(doc.paths['/api/v1/jobs']!.get)).toContain('employmentType');
    expect(Object.keys(doc.paths['/api/v1/applications/{id}']!.patch!.responses)).toEqual(
      expect.arrayContaining(['200', '401', '403', '404', '409', '422'])
    );
    expect(JSON.stringify(doc)).not.toContain('"/api/jobs"');
  });

  test('docs are served in development mode', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.info.title).toMatch(/Job Portal/);
    expect((await request(app).get('/api/v1/docs')).status).toBe(200);
    expect((await request(app).get('/api/v1/docs/assets/swagger-ui-bundle.js')).status).toBe(200);
  });
});
