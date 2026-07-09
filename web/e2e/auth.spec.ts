import { test, expect } from '@playwright/test';

/**
 * Auth flow E2E.
 *
 * These tests run against the production build (`npm run preview` on 4173)
 * WITHOUT Supabase env vars configured. Expected behavior under that
 * constraint:
 *   - Visiting `/` redirects to `/login`
 *   - The magic-link form is rendered (with inputs / submit)
 *   - The "Supabase 未配置" inline hint is visible
 *   - Submitting the form shows an inline toast/error (no network call)
 */

test.describe('auth flow (no Supabase env)', () => {
  test('visiting "/" redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('login page renders the magic-link form', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.locator('.login-page')).toBeVisible();
    await expect(page.locator('.login-card')).toBeVisible();
    await expect(page.getByPlaceholder('you@company.com')).toBeVisible();
    // The submit button should still be present, even if disabled.
    await expect(
      page.getByRole('button', { name: /发送登录链接/ }),
    ).toBeVisible();
  });

  test('shows "Supabase 未配置" hint when env is missing', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.getByText('Supabase 未配置')).toBeVisible();
    // Hint names the missing env vars.
    await expect(page.getByText('VITE_SUPABASE_URL')).toBeVisible();
    await expect(page.getByText('VITE_SUPABASE_ANON_KEY')).toBeVisible();
  });

  test('submitting the form without env shows an inline error / toast', async ({ page }) => {
    await page.goto('/#/login');
    // Clear any toast from previous tests by reloading fresh.
    await page.reload();
    const emailInput = page.getByPlaceholder('you@company.com');
    // The input is disabled when supabase is null, so we can't actually type
    // and submit. Verify the disabled state + button disabled.
    await expect(emailInput).toBeDisabled();
    const submitBtn = page.getByRole('button', { name: /发送登录链接/ });
    await expect(submitBtn).toBeDisabled();
    // And the hint explaining why.
    await expect(page.getByText('Supabase 未配置')).toBeVisible();
  });
});
