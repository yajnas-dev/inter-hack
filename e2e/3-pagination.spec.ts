import { expect, test } from '@playwright/test';
import { PASSWORD, unique } from './helpers';

test('job search pages through every result (cursor) and filters live in the URL', async ({ page, request }) => {
  const tag = unique('pg').replace(/[^a-z0-9]/gi, '');
  const email = `${unique('pager')}@example.com`;
  const auth = await request.post('/api/auth/register', { data: { name: 'Pager', email, password: PASSWORD, role: 'RECRUITER' } });
  const { token } = (await auth.json()) as { token: string };
  const headers = { Authorization: `Bearer ${token}` };

  const company = (await (await request.post('/api/companies', { headers, data: { name: 'Pager Co' } })).json()) as {
    company: { id: string };
  };
  for (let i = 0; i < 25; i += 1) {
    const res = await request.post('/api/jobs', {
      headers,
      data: {
        company: company.company.id,
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
