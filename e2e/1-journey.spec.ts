import { expect, test } from '@playwright/test';
import { ADMIN } from './global-setup';
import { login, logout, register, unique } from './helpers';

// FR-01..FR-08 end to end through the real UI, real API and real database.
test('recruiter -> seeker -> recruiter -> admin journey', async ({ page }) => {
  const recruiter = { name: 'Rita Recruiter', email: `${unique('rita')}@example.com`, role: 'RECRUITER' as const };
  const seeker = { name: 'Sam Seeker', email: `${unique('sam')}@example.com`, role: 'JOB_SEEKER' as const };

  await test.step('FR-02: recruiter registers, creates a company and posts a job', async () => {
    await register(page, recruiter);
    await expect(page).toHaveURL(/\/recruiter\/company$/);
    await page.getByLabel('Company name').fill('Acme Labs');
    await page.getByRole('button', { name: 'Create company' }).click();
    await expect(page.getByText('Company profile saved.')).toBeVisible();

    await page.goto('/recruiter/jobs/new');
    await page.getByLabel('Job title').fill('Senior Backend Engineer');
    await page.getByLabel('Description').fill('Build fast, reliable APIs on MongoDB.');
    await page.getByLabel('Location').fill('Pune');
    await page.getByLabel('Salary min').fill('900000');
    await page.getByLabel('Salary max').fill('1800000');
    await page.getByLabel('Experience required (years)').fill('3');
    const skills = page.getByLabel('Required skills');
    await skills.fill('Node.js');
    await skills.press('Enter');
    await skills.fill('MongoDB');
    await skills.press('Enter');
    await page.getByRole('button', { name: 'Post job' }).click();
    await expect(page).toHaveURL(/\/recruiter\/jobs$/);
    await expect(page.getByRole('link', { name: 'Senior Backend Engineer' })).toBeVisible();
    await logout(page);
  });

  await test.step('FR-01/03/04: seeker registers, searches with combined filters, opens the job', async () => {
    await register(page, seeker);
    await expect(page).toHaveURL(/\/jobs$/);
    await page.getByLabel('Location').fill('pune');
    await page.getByRole('button', { name: 'Skills' }).click();
    await page.getByLabel('Skills (comma separated)').fill('mongodb');
    await expect(page.getByRole('heading', { level: 1, name: '1 job' })).toBeVisible();
    await expect(page).toHaveURL(/location=pune/); // filters live in the URL (shareable, back-button friendly)
    await expect(page.getByRole('group', { name: 'Active filters' })).toContainText('pune');
    await page.getByRole('link', { name: 'Senior Backend Engineer' }).first().click();
    await expect(page.getByText('Build fast, reliable APIs on MongoDB.')).toBeVisible();
    await expect(page.getByText('Acme Labs').first()).toBeVisible();
  });

  await test.step('FR-01: seeker fills the profile and uploads a resume', async () => {
    await page.goto('/seeker/profile');
    await page.getByLabel('Headline').fill('Backend developer');
    const skills = page.getByLabel('Add skills');
    for (const skill of ['Node.js', 'MongoDB', 'TypeScript']) {
      await skills.fill(skill);
      await skills.press('Enter');
    }
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Profile completeness' })).toHaveAttribute('aria-valuenow', '40');

    await page.goto('/seeker/resume');
    await page
      .getByLabel(/Resume file/)
      .setInputFiles({ name: 'sam-resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 Sam resume') });
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    await expect(page.getByText('Resume uploaded.')).toBeVisible();
  });

  await test.step('FR-05: apply once; the job then shows as applied and a duplicate is rejected', async () => {
    await page.goto('/jobs');
    await page.getByRole('link', { name: 'Senior Backend Engineer' }).first().click();
    await page.getByRole('button', { name: 'Apply', exact: true }).first().click();
    await page.getByLabel('Cover note (optional)').fill('Excited to build APIs with you.');
    await page.getByRole('button', { name: 'Submit application' }).click();
    await expect(page.getByText('Application submitted successfully.')).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('link', { name: /Applied: view status/ }).first()).toBeVisible();

    const status = await page.evaluate(async () => {
      const auth = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'X-Requested-With': 'fetch' } });
      const { token } = (await auth.json()) as { token: string };
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const list = (await (await fetch('/api/jobs?title=Senior')).json()) as { jobs: Array<{ id: string }> };
      const dup = await fetch('/api/applications', { method: 'POST', headers, body: JSON.stringify({ jobId: list.jobs[0]?.id }) });
      return dup.status;
    });
    expect(status).toBe(409);
  });

  await test.step('seeker tracks the application in My jobs', async () => {
    await page.goto('/seeker/jobs');
    await expect(page.getByRole('tab', { name: /Applications/ })).toContainText('1');
    await expect(page.locator('.pill-APPLIED').first()).toBeVisible();
    await logout(page);
  });

  await test.step('FR-06/07: recruiter reviews the candidate, sees the profile, downloads the resume, shortlists', async () => {
    await login(page, recruiter.email);
    await expect(page).toHaveURL(/\/recruiter$/);
    await expect(page.getByRole('heading', { name: /Welcome back, Rita/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Notifications/ })).toBeVisible();

    await page.goto('/recruiter/jobs');
    await page.getByRole('link', { name: 'Senior Backend Engineer' }).click();
    await expect(page.getByRole('region', { name: /^Applied, 1 candidates/ })).toContainText('Sam Seeker');

    await page.getByRole('button', { name: 'Sam Seeker', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Candidate' });
    await expect(drawer.getByText('Backend developer')).toBeVisible(); // FR-06: applicant profile
    await expect(drawer.getByText('TypeScript')).toBeVisible();
    await expect(drawer.getByText('Excited to build APIs with you.')).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent('download'), drawer.getByRole('button', { name: 'Download resume' }).click()]);
    expect(download.suggestedFilename()).toBe('sam-resume.pdf');

    await expect(drawer.getByRole('button', { name: 'Move to Interview' })).toHaveCount(0); // no skipping steps
    await drawer.getByRole('button', { name: 'Move to Shortlisted' }).click();
    await expect(page.getByRole('region', { name: /^Shortlisted, 1 candidates/ })).toContainText('Sam Seeker');
    await expect(page.getByRole('region', { name: /^Applied, 0 candidates/ })).toBeVisible();
    await logout(page);
  });

  await test.step('FR-05/07: seeker is notified and sees the new status and history', async () => {
    await login(page, seeker.email);
    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(page.getByText(/moved to SHORTLISTED/)).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/seeker/jobs');
    await page.getByRole('tab', { name: /Shortlisted/ }).click();
    await expect(page.locator('.pill-SHORTLISTED').first()).toBeVisible();
    await page.getByRole('link', { name: 'Senior Backend Engineer' }).click();
    await expect(page.getByText('Status history')).toBeVisible();
    await logout(page);
  });

  await test.step('FR-08: admin dashboard and management tables reflect the activity', async () => {
    await login(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(page.locator('.kpi', { hasText: 'Applications' })).toContainText('1');
    await expect(page.locator('.kpi', { hasText: 'Users' })).toContainText('3');
    for (const [path, text] of [
      ['/admin/users', 'Sam Seeker'],
      ['/admin/jobs', 'Senior Backend Engineer'],
      ['/admin/applications', 'Shortlisted'],
      ['/admin/companies', 'Acme Labs']
    ] as const) {
      await page.goto(path);
      await expect(page.getByText(text).first()).toBeVisible();
    }
  });
});
