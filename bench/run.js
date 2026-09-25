// Load-tests the API (spawned in production mode against the bench DB) and enforces bench/budgets.json.
// Env: BENCH_ONLY=<regex of scenario names>  BENCH_WORKERS=1  BENCH_DURATION=8  BENCH_CONNECTIONS=20  BENCH_UPDATE_BUDGETS=1
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const autocannon = require('autocannon');

const PORT = 5055;
const BASE = `http://127.0.0.1:${PORT}`;
const DURATION = Number(process.env.BENCH_DURATION) || 8;
const CONN = Number(process.env.BENCH_CONNECTIONS) || 20;
const WORKERS = process.env.BENCH_WORKERS || '1';
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '.bench-fixture.json'), 'utf8'));
const budgetsPath = path.join(__dirname, 'budgets.json');
// Budgets describe the standard profile (1 worker, 20 connections); other profiles are informational.
const budgets = WORKERS === '1' && CONN === 20 ? JSON.parse(fs.readFileSync(budgetsPath, 'utf8')) : {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (o) =>
  new Promise((resolve) =>
    autocannon({ connections: CONN, duration: DURATION, ...o, url: BASE + (o.path || '') }, (_err, result) => resolve(result))
  );
async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' })
  });
  return (await r.json()).token;
}

(async () => {
  // Benchmarks the production build (what actually ships), not the dev transpiler.
  execSync('npm run build --workspace=server', { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  const server = spawn(process.execPath, [path.join(__dirname, '../server/dist/cluster.js')], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      MONGO_URI: process.env.BENCH_MONGO_URI || 'mongodb://127.0.0.1:27017/job_portal_bench?replicaSet=rs0',
      RATE_LIMIT_PER_MIN: '100000000',
      AUTH_RATE_LIMIT: '100000000',
      JWT_SECRET: 'bench-secret-that-is-long-enough-for-validation',
      LOG_LEVEL: 'error',
      ACCESS_TOKEN_TTL: '3h',
      WEB_CONCURRENCY: WORKERS
    },
    stdio: 'ignore'
  });
  const stop = () =>
    new Promise((resolve) => {
      server.once('exit', resolve);
      server.kill('SIGTERM');
      setTimeout(() => server.kill('SIGKILL'), 5000).unref();
    });

  try {
    for (let i = 0; i < 60; i += 1) {
      if (
        await fetch(`${BASE}/api/health`)
          .then((r) => r.ok)
          .catch(() => false)
      )
        break;
      await sleep(500);
    }
    const [rec, seek, admin] = await Promise.all([login(fixture.recruiter), login(fixture.seeker), login('admin@bench.io')]);
    const auth = (t) => ({ authorization: `Bearer ${t}` });
    const gzip = { 'accept-encoding': 'gzip' };
    const staleCursor = Buffer.from(JSON.stringify({ t: Date.now() - 86400000, i: '000000000000000000000000' })).toString('base64url');
    const loginBody = JSON.stringify({ email: fixture.seeker, password: 'password123' });
    // Unique query string per request => every request misses the response cache and hits MongoDB.
    const miss = (base, headers = gzip) => ({
      requests: [
        {
          method: 'GET',
          headers,
          setupRequest: (req) => ({ ...req, path: `${base}${base.includes('?') ? '&' : '?'}nc=${Math.random().toString(36).slice(2)}` })
        }
      ]
    });
    const cases = {
      health: { path: '/api/health' },
      'jobs default (gzip)': { path: '/api/jobs', headers: gzip },
      'jobs limit=50 (gzip)': { path: '/api/jobs?limit=50', headers: gzip },
      'jobs default (identity)': { path: '/api/jobs' },
      'jobs cursor page': { path: `/api/jobs?limit=20&cursor=${staleCursor}`, headers: gzip },
      'jobs location+type+exp': { path: '/api/jobs?location=pune&employmentType=FULL_TIME&experience=5', headers: gzip },
      'jobs title search': { path: '/api/jobs?title=engineer', headers: gzip },
      'jobs skills filter': { path: '/api/jobs?skills=react,node.js', headers: gzip },
      'jobs title+loc+skills+type': { path: '/api/jobs?title=backend&location=bang&skills=python&employmentType=FULL_TIME', headers: gzip },
      'MISS jobs default': miss('/api/jobs'),
      'MISS jobs location+type+exp': miss('/api/jobs?location=pune&employmentType=FULL_TIME&experience=5'),
      'MISS jobs title search': miss('/api/jobs?title=engineer'),
      'MISS jobs skills filter': miss('/api/jobs?skills=react,node.js'),
      'MISS jobs title+loc+skills+type': miss('/api/jobs?title=backend&location=bang&skills=python&employmentType=FULL_TIME'),
      'jobs multi-type+salary+posted': {
        path: '/api/jobs?employmentType=FULL_TIME,CONTRACT&minSalary=500000&postedWithin=30',
        headers: gzip
      },
      'jobs sort=salary': { path: '/api/jobs?sort=salary', headers: gzip },
      'MISS jobs sort=salary': miss('/api/jobs?sort=salary'),
      'jobs facets': { path: '/api/jobs/facets', headers: gzip },
      'job similar': { path: `/api/jobs/${fixture.jobId}/similar`, headers: gzip },
      'job detail': { path: `/api/jobs/${fixture.jobId}`, headers: gzip },
      'saved ids (seeker)': { path: '/api/seekers/me/saved/ids', headers: auth(seek) },
      'notifications unread (seeker)': { path: '/api/notifications/unread-count', headers: auth(seek) },
      'recruiter overview': { path: '/api/recruiters/me/overview', headers: auth(rec) },
      'jobs/mine (recruiter)': { path: '/api/jobs/mine', headers: auth(rec) },
      'job applicants (recruiter)': { path: `/api/jobs/${fixture.jobId}/applications`, headers: auth(rec) },
      'applications/mine (seeker)': { path: '/api/applications/mine', headers: auth(seek) },
      'admin applications': { path: '/api/admin/applications', headers: auth(admin) },
      'admin summary': { path: '/api/admin/reports/summary', headers: auth(admin) },
      'admin top-jobs': { path: '/api/admin/reports/top-jobs', headers: auth(admin) },
      'admin top-companies': { path: '/api/admin/reports/top-companies', headers: auth(admin) },
      'login (bcrypt)': {
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: loginBody,
        connections: 10
      }
    };

    const rows = [];
    const only = process.env.BENCH_ONLY ? new RegExp(process.env.BENCH_ONLY, 'i') : null;
    for (const [name, o] of Object.entries(cases)) {
      if (only && !only.test(name)) continue;
      const r = await run(o);
      rows.push({
        name,
        rps: Math.round(r.requests.average),
        p50: r.latency.p50,
        p99: r.latency.p99,
        kb: +(r.throughput.total / Math.max(1, r['2xx']) / 1024).toFixed(1),
        bad: r.non2xx + r.errors + r.timeouts
      });
    }

    // Does a login storm starve cheap requests? (native bcrypt must stay off the event loop)
    const jobUrl = `/api/jobs/${fixture.jobId}`;
    const alone = await run({ path: jobUrl });
    const [mixed] = await Promise.all([
      run({ path: jobUrl }),
      run({ path: '/api/auth/login', method: 'POST', connections: 5, headers: { 'content-type': 'application/json' }, body: loginBody })
    ]);
    const retained = +(mixed.requests.average / alone.requests.average).toFixed(2);

    console.log(`workers=${WORKERS} connections=${CONN} duration=${DURATION}s`);
    console.log(`${'scenario'.padEnd(30) + 'req/s'.padStart(8) + 'p50'.padStart(6) + 'p99'.padStart(6) + 'KB/resp'.padStart(9)}  budget`);
    let failed = 0;
    for (const r of rows) {
      const b = budgets[r.name];
      const ok = !r.bad && (!b || (r.rps >= b.minRps && (!b.maxP99 || r.p99 <= b.maxP99)));
      if (!ok) failed += 1;
      const note = r.bad ? `ERRORS ${r.bad}` : b ? (ok ? `ok (>=${b.minRps})` : `FAIL (>=${b.minRps}, p99<=${b.maxP99 || '-'})`) : '-';
      console.log(
        r.name.padEnd(30) +
          String(r.rps).padStart(8) +
          String(r.p50).padStart(6) +
          String(r.p99).padStart(6) +
          String(r.kb).padStart(9) +
          '  ' +
          note
      );
    }
    console.log(
      `event loop: cheap-request throughput kept during login storm = ${(retained * 100).toFixed(0)}%${retained < 0.7 ? '  FAIL (<70%)' : '  ok'}`
    );
    if (retained < 0.7) failed += 1;

    if (process.env.BENCH_UPDATE_BUDGETS) {
      const next = {};
      for (const r of rows) next[r.name] = { minRps: Math.floor(r.rps * 0.6), maxP99: Math.ceil(Math.max(r.p99 * 2.5, 10)) };
      fs.writeFileSync(budgetsPath, `${JSON.stringify(next, null, 2)}\n`);
      console.log('budgets written: 60% of measured req/s, 2.5x measured p99');
    }
    await stop();
    process.exit(failed ? 1 : 0);
  } catch (e) {
    console.error(e);
    await stop();
    process.exit(1);
  }
})();
