import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'password123';

export async function register(page: Page, opts: { name: string; email: string; role: 'JOB_SEEKER' | 'RECRUITER' }): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('I am a').selectOption(opts.role);
  await page.getByLabel('Name').fill(opts.name);
  await page.getByLabel('Email').fill(opts.email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Register' }).click();
}

export async function login(page: Page, email: string, password = PASSWORD, { expectSuccess = true } = {}): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
  if (expectSuccess) await page.waitForURL((url) => !url.pathname.endsWith('/login')); // session established
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

export const unique = (prefix: string): string => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
