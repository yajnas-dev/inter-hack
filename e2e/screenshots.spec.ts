import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from './global-setup';
import { login, logout } from './helpers';
import { seedWorld, type World } from './world';

// Visual review aid, not a regression test: `SHOTS=1 npx playwright test e2e/screenshots.spec.ts`
// writes full-page PNGs to ./screenshots at phone, tablet and desktop widths.
test.skip(!process.env.SHOTS, 'set SHOTS=1 to capture screenshots');

const SIZES = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 }
];
const OUT = 'screenshots';

let world: World;
test.beforeAll(async ({ playwright, baseURL }) => {
  mkdirSync(OUT, { recursive: true });
  const request = await playwright.request.newContext({ baseURL });
  world = await seedWorld(request);
  await request.dispose();
});

async function shoot(page: Page, name: string, theme: 'light' | 'dark' = 'light') {
  await page.evaluate((t) => {
    localStorage.setItem('theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.skeleton')).toHaveCount(0);
  await page.waitForTimeout(250);
  const size = page.viewportSize();
  await page.screenshot({ path: `${OUT}/${name}-${size?.width}-${theme}.png`, fullPage: true });
}

for (const size of SIZES) {
  test(`public at ${size.name}`, async ({ page }) => {
    await page.setViewportSize(size);
    for (const [name, path] of [
      ['home', '/'],
      ['jobs', '/jobs'],
      ['job', `/jobs/${world.jobIds[0]}`],
      ['login', '/login'],
      ['register', '/register']
    ] as const) {
      await page.goto(path);
      await page.waitForTimeout(1200);
      await shoot(page, name);
      if (size.name !== '768') await shoot(page, name, 'dark');
    }
  });

  test(`seeker at ${size.name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await login(page, world.seeker.email);
    for (const [name, path] of [
      ['tracker', '/seeker/jobs'],
      ['profile', '/seeker/profile']
    ] as const) {
      await page.goto(path);
      await shoot(page, name);
    }
    await page.goto('/seeker/jobs');
    await shoot(page, 'tracker', 'dark');
  });

  test(`recruiter at ${size.name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await login(page, world.recruiter.email);
    for (const [name, path] of [
      ['recruiter-dashboard', '/recruiter'],
      ['recruiter-jobs', '/recruiter/jobs'],
      ['board', `/recruiter/jobs/${world.mainJobId}/applicants`]
    ] as const) {
      await page.goto(path);
      await shoot(page, name);
    }
    await page.getByRole('button', { name: 'Ava Shah', exact: true }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/drawer-${size.width}-light.png` });
    await page.keyboard.press('Escape');
    await page.goto(`/recruiter/jobs/${world.mainJobId}/applicants`);
    await shoot(page, 'board', 'dark');
  });
}

test('admin at 1440', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, ADMIN.email, ADMIN.password);
  await shoot(page, 'admin-dashboard');
  await page.goto('/admin/users');
  await shoot(page, 'admin-users');
  await shoot(page, 'admin-users', 'dark');
  await logout(page);
});
