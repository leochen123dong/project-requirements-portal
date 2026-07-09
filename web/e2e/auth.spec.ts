import { test, expect } from '@playwright/test';

/**
 * Auth flow E2E.
 *
 * These tests run against the production build (`npm run preview` on 4173)
 * WITHOUT Supabase env vars configured. Expected behavior under that
 * constraint:
 *   - Visiting `/` redirects to `/login`
 *   - The login form is rendered (with email / password inputs + submit)
 *   - The "Supabase 未配置" inline hint is visible
 *   - The form is disabled (cannot submit when supabase is null)
 *
 * v0.2 update: LoginPage now defaults to "密码登录" (password) mode instead
 * of magic-link, and the form fields use `id="email-pw"` / `id="password"`
 * instead of placeholder-based selectors.
 */

test.describe('auth flow (no Supabase env)', () => {
  test('visiting "/" redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('login page renders the password form (default mode)', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.locator('.login-page')).toBeVisible();
    await expect(page.locator('.login-card')).toBeVisible();
    // Email + password inputs are present
    await expect(page.locator('#email-pw')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    // The default-mode submit button reads "登录" (password login is the default)
    await expect(page.getByRole('button', { name: /^登录$/ })).toBeVisible();
    // Mode toggle is present
    await expect(page.getByRole('button', { name: /密码登录/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /邮箱链接/ })).toBeVisible();
  });

  test('switching to magic-link mode shows the magic-link form', async ({ page }) => {
    await page.goto('/#/login');
    await page.getByRole('button', { name: /邮箱链接/ }).click();
    // Email input under the magic-link form (different id)
    await expect(page.locator('#email-magic')).toBeVisible();
    await expect(page.getByRole('button', { name: /发送登录链接/ })).toBeVisible();
  });

  test('shows "Supabase 未配置" hint when env is missing', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.getByText('Supabase 未配置')).toBeVisible();
    // Hint names the missing env vars.
    await expect(page.getByText('VITE_SUPABASE_URL')).toBeVisible();
    await expect(page.getByText('VITE_SUPABASE_ANON_KEY')).toBeVisible();
  });

  test('submitting the form without env shows the submit button disabled', async ({ page }) => {
    await page.goto('/#/login');
    await page.reload();
    // The submit button is disabled when supabase is null (inputs stay
    // enabled so the user can see what fields would be filled).
    const submitBtn = page.getByRole('button', { name: /^登录$/ });
    await expect(submitBtn).toBeDisabled();
    // And the hint explaining why.
    await expect(page.getByText('Supabase 未配置')).toBeVisible();
  });
});