import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from './global-setup';
import { login, logout } from './helpers';
import { seedWorld, type World } from './world';

let world: World;
test.beforeAll(async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  world = await seedWorld(request);
  await request.dispose();
});

const settle = async (page: Page) => {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.skeleton')).toHaveCount(0);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => undefined))
    )
  ); // colours are stable once transitions end
};

async function expectAccessible(page: Page, label: string) {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = serious.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`
  );
  expect(summary, `axe: ${label}`).toEqual([]);
}

/** Visits each path in light and dark and requires zero serious/critical accessibility violations. */
async function scanPages(page: Page, paths: string[]) {
  for (const theme of ['light', 'dark'] as const) {
    for (const path of paths) {
      await page.goto(path);
      await page.evaluate((t) => {
        localStorage.setItem('theme', t);
        document.documentElement.setAttribute('data-theme', t);
      }, theme);
      await expectAccessible(page, `${path} (${theme})`);
    }
  }
}

test.describe('discovery', () => {
  test('filters become removable chips, count updates, Clear all resets, sort by salary works', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.getByRole('heading', { level: 1, name: /\d+ jobs/ })).toBeVisible();

    await page.getByRole('button', { name: 'Job type' }).click();
    await page.getByLabel('Contract').check();
    await page.keyboard.press('Escape');
    const chips = page.getByRole('group', { name: 'Active filters' });
    await expect(chips).toContainText('Contract');
    await expect(page.getByRole('heading', { level: 1, name: '1 job' })).toBeVisible();
    await expect(page).toHaveURL(/employmentType=CONTRACT/);

    await chips.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /\d+ jobs/ })).toBeVisible();
    await expect(chips).toHaveCount(0);

    await page.getByRole('button', { name: /^Sort/ }).click();
    await page.getByRole('menuitemradio', { name: 'Highest salary' }).click();
    await expect(page).toHaveURL(/sort=salary/);
    await expect(page.locator('.split-list .job-card').first()).toContainText('DevOps Engineer');
  });

  test('selecting a card fills the detail pane and keeps the job in the URL', async ({ page }) => {
    await page.goto('/jobs');
    await page.locator('.split-list .job-card', { hasText: 'Product Designer' }).getByRole('link').click();
    await expect(page).toHaveURL(/job=/);
    await expect(page.getByRole('complementary', { name: 'Job details' })).toContainText('Product Designer');
    await expect(page.getByRole('complementary', { name: 'Job details' })).toContainText('Similar jobs');
  });

  test('the company page lists its open roles', async ({ page }) => {
    await page.goto('/jobs');
    await page.getByRole('link', { name: 'Northwind Labs' }).first().click();
    await expect(page.getByRole('heading', { name: 'Northwind Labs' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Frontend Developer' })).toBeVisible();
  });
});

test.describe('appearance and responsiveness', () => {
  test('Ctrl+K opens the command palette, which searches jobs and closes with Escape', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    const box = page.getByRole('combobox', { name: /Search jobs or jump/ });
    await expect(box).toBeFocused();
    await box.fill('designer');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/jobs\?title=designer/);
    await page
      .getByRole('button', { name: /^Search/ })
      .first()
      .click();
    await page.keyboard.press('Escape');
    await expect(box).toHaveCount(0);
  });

  test('the theme choice persists across reloads', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Theme/ }).click();
    await page.getByRole('menuitemradio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('on a phone the nav collapses into a drawer and nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    for (const path of ['/', '/jobs', '/login']) {
      await page.goto(path);
      await settle(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(0);
    }
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Find jobs' })).toBeVisible();

    await page.goto('/jobs');
    await page.getByRole('button', { name: /^Filters/ }).click();
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
  });
});

test.describe('job seeker', () => {
  test('saving a job puts it under Saved in My jobs and shows applied state', async ({ page }) => {
    await login(page, world.seeker.email);
    await page.goto('/jobs');
    const card = page.locator('.split-list .job-card', { hasText: 'Product Designer' });
    await card.getByRole('button', { name: 'Save job' }).click();
    await expect(card.getByRole('button', { name: 'Remove from saved jobs' })).toBeVisible();
    await expect(
      page.locator('.split-list .job-card', { hasText: 'Frontend Developer' }).getByText('Applied', { exact: true })
    ).toBeVisible();

    await page.goto('/seeker/jobs');
    await page.getByRole('tab', { name: /Saved/ }).click();
    await expect(page.getByRole('link', { name: 'Product Designer' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove from saved jobs' }).click();
    await expect(page.getByText('No saved jobs yet')).toBeVisible();
  });

  test('the tracker shows a stepper and the profile shows a completeness meter', async ({ page }) => {
    await login(page, world.seeker.email);
    await page.goto('/seeker/jobs');
    await expect(page.getByRole('list', { name: /Application progress: Applied/ })).toBeVisible();
    await page.goto('/seeker/profile');
    await expect(page.getByRole('progressbar', { name: 'Profile completeness' })).toHaveAttribute('aria-valuenow', '100');
  });
});

test.describe('recruiter pipeline', () => {
  test('bulk actions and drag-and-drop honour the allowed transitions', async ({ page }) => {
    await login(page, world.recruiter.email);
    await page.goto(`/recruiter/jobs/${world.mainJobId}/applicants`);
    const region = (stage: string) => page.getByRole('region', { name: new RegExp(`^${stage}, \\d+ candidates`) });

    await expect(region('Applied')).toContainText('Esha Rao');
    await expect(region('Selected')).toContainText('Dev Patel');
    await expect(region('Rejected')).toContainText('Chloe Park');

    // List view + bulk move
    await page.getByRole('button', { name: 'List' }).click();
    await page.getByLabel('Select Esha Rao').check();
    await page.getByLabel('Select Finn Blake').check();
    const bar = page.getByRole('region', { name: 'Bulk actions' });
    await expect(bar).toContainText('2 selected');
    await bar.getByRole('button', { name: 'Move to Shortlisted' }).click();
    await expect(page.getByText('2 candidates moved to Shortlisted.')).toBeVisible();

    // Board: an illegal drop is refused, a legal one moves the card. The drag is a real press-move-release
    // gesture: Playwright's one-shot dragTo() from the card centre does not reliably start an HTML5 drag.
    await page.getByRole('button', { name: 'Board' }).click();
    const drag = async (name: string, stage: string) => {
      const card = page.locator('.k-card', { hasText: name });
      await card.scrollIntoViewIfNeeded();
      const from = (await card.boundingBox())!;
      await page.mouse.move(from.x + 20, from.y + 12);
      await page.mouse.down();
      const to = (await region(stage).boundingBox())!;
      await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 12 });
      await page.mouse.up();
    };
    await drag('Gia Novak', 'Interview');
    await expect(region('Applied')).toContainText('Gia Novak'); // Applied -> Interview is not allowed
    await drag('Gia Novak', 'Shortlisted');
    await expect(region('Shortlisted')).toContainText('Gia Novak');

    // Keyboard/menu alternative to dragging
    const move = page.getByRole('button', { name: 'Move Gia Novak' });
    await move.click();
    await page.getByRole('menuitem', { name: 'Move to Interview' }).click();
    await expect(region('Interview')).toContainText('Gia Novak');
  });

  test('the dashboard summarises the pipeline and jobs can be duplicated', async ({ page }) => {
    await login(page, world.recruiter.email);
    await expect(page.getByRole('heading', { name: /Welcome back, Rita/ })).toBeVisible();
    await expect(page.locator('.kpi', { hasText: 'Open jobs' })).toContainText('8');
    await page.goto('/recruiter/jobs');
    await expect(page.getByRole('row', { name: /Senior Backend Engineer/ })).toContainText('7'); // applicants
    await page.getByRole('button', { name: 'Actions for Frontend Developer' }).click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect(page.getByLabel('Job title')).toHaveValue('Frontend Developer (copy)');
    await expect(page.getByRole('textbox', { name: 'Required skills' })).toBeVisible();
  });

  test('deleting a job asks for confirmation first', async ({ page }) => {
    await login(page, world.recruiter.email);
    await page.goto('/recruiter/jobs');
    await page.getByRole('button', { name: 'Actions for Customer Success Manager' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete this job?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('row', { name: /Customer Success Manager/ })).toBeVisible();
  });
});

test.describe('accessibility (axe, WCAG 2.1 AA, light and dark)', () => {
  test.setTimeout(180_000);

  test('public pages', async ({ page }) => {
    await scanPages(page, ['/', '/jobs', `/jobs/${world.jobIds[0]}`, '/login', '/register', '/does-not-exist']);
  });

  test('seeker pages', async ({ page }) => {
    await login(page, world.seeker.email);
    await scanPages(page, ['/seeker/jobs', '/seeker/profile', '/seeker/resume', '/notifications']);
    await logout(page);
  });

  test('recruiter pages', async ({ page }) => {
    await login(page, world.recruiter.email);
    await scanPages(page, [
      '/recruiter',
      '/recruiter/jobs',
      '/recruiter/jobs/new',
      '/recruiter/company',
      `/recruiter/jobs/${world.mainJobId}/applicants`
    ]);
    await page.getByRole('button', { name: 'List' }).click();
    await expectAccessible(page, 'applicants list');
    await page.getByRole('button', { name: 'Ava Shah', exact: true }).click();
    await expectAccessible(page, 'candidate drawer');
    await page.keyboard.press('Escape'); // the drawer is modal, so close it before using the header
    await logout(page);
  });

  test('admin pages', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await scanPages(page, ['/admin/dashboard', '/admin/users', '/admin/companies', '/admin/jobs', '/admin/applications']);
  });
});
