import { expect, test } from '@playwright/test';
import { login, logout, register, unique } from './helpers';

test.describe('sessions and access control', () => {
  test('the session survives a reload (httpOnly refresh cookie) and logout really ends it', async ({ page, context }) => {
    const email = `${unique('sess')}@example.com`;
    await register(page, { name: 'Sess User', email, role: 'JOB_SEEKER' });
    await expect(page).toHaveURL(/\/jobs$/);

    const cookie = (await context.cookies()).find((c) => c.name === 'jp_refresh');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Strict'); // never sent on cross-site requests
    expect(await page.evaluate(() => document.cookie)).not.toContain('jp_refresh'); // invisible to scripts
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/token/i); // nothing stored for XSS to steal

    await page.reload();
    await expect(page.getByRole('button', { name: 'Account menu for Sess User' })).toBeVisible();
    await page.goto('/seeker/applications'); // legacy route redirects to the tracker
    await expect(page).toHaveURL(/\/seeker\/jobs$/);
    await expect(page.getByRole('heading', { name: 'My jobs' })).toBeVisible();

    await logout(page);
    expect((await context.cookies()).find((c) => c.name === 'jp_refresh')).toBeUndefined();
    await page.goto('/seeker/jobs');
    await expect(page).toHaveURL(/\/login$/); // protected pages bounce to login

    // The revoked refresh token is dead server-side too, not merely forgotten by the browser.
    const replay = await page.request.post('/api/v1/auth/refresh', {
      headers: { 'X-Requested-With': 'fetch', Cookie: `jp_refresh=${cookie!.value}` }
    });
    expect(replay.status()).toBe(401);
  });

  test('a job seeker cannot reach recruiter or admin areas, in the UI or the API', async ({ page }) => {
    const email = `${unique('guard')}@example.com`;
    await register(page, { name: 'Guard User', email, role: 'JOB_SEEKER' });
    await expect(page).toHaveURL(/\/jobs$/);

    for (const path of ['/admin/dashboard', '/recruiter/jobs']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/); // redirected home
    }

    const token = await page.evaluate(async () => {
      const res = await fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'X-Requested-With': 'fetch' } });
      return ((await res.json()) as { data: { accessToken: string } }).data.accessToken;
    });
    const forbidden = await page.request.get('/api/v1/admin/users', { headers: { Authorization: `Bearer ${token}` } });
    expect(forbidden.status()).toBe(403);
  });

  test('wrong credentials show an error and validation runs in the browser', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByText('Email is required')).toBeVisible();

    await login(page, 'nobody@example.com', 'wrong-password', { expectSuccess: false });
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible();
  });

  test('the SPA fallback serves deep links and unknown API routes stay JSON 404s', async ({ page, request }) => {
    await page.goto('/jobs/000000000000000000000000');
    await expect(page.getByRole('alert')).toContainText('Job not found');
    const api = await request.get('/api/v1/nope');
    expect(api.status()).toBe(404);
    expect((await api.json()).error.code).toBe('ROUTE_NOT_FOUND');
    expect(api.headers()['x-request-id']).toBeTruthy();
  });
});
