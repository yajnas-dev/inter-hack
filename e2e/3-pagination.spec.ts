import { expect, test } from '@playwright/test';
import { PASSWORD, unique } from './helpers';

test('job search pages through every result (cursor) and filters live in the URL', async ({ page, request }) => {
  const tag = unique('pg').replace(/[^a-z0-9]/gi, '');
  const email = `${unique('pager')}@example.com`;
  const auth = await request.post('/api/v1/auth/register', { data: { name: 'Pager', email, password: PASSWORD, role: 'RECRUITER' } });
  const { data } = (await auth.json()) as { data: { accessToken: string } };
  const headers = { Authorization: `Bearer ${data.accessToken}` };

  expect((await request.post('/api/v1/companies', { headers, data: { name: 'Pager Co' } })).status()).toBe(201);
  for (let i = 0; i < 25; i += 1) {
    const res = await request.post('/api/v1/jobs', {
      headers,
      data: {
        title: `${tag} Engineer ${i}`,
        description: 'Pagination fixture',
        location: 'Remote',
        salaryMin: 1,
        salaryMax: 2,
        experienceRequired: 1,
        employmentType: 'FULL_TIME',
        requiredSkills: ['Testing']
      }
    });
    expect(res.status()).toBe(201);
  }

  await page.goto(`/jobs?title=${tag}`);
  await expect(page.getByText('25 jobs')).toBeVisible();
  await expect(page.locator('.split-list .job-card')).toHaveCount(20); // first page
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(page.locator('.split-list .job-card')).toHaveCount(25); // every result reachable
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
});
