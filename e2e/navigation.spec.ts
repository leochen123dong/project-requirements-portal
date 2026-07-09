import { test, expect } from '@playwright/test';

/**
 * Navigation + role gates, no-Supabase mode.
 *
 * Without a session, RequireAuth redirects every gated route to /login.
 * Validate the redirect behavior for both known and unknown routes.
 */

test.describe('navigation & auth gate (no Supabase env)', () => {
  test('visiting /admin while logged out redirects to /login', async ({ page }) => {
    await page.goto('/#/admin');
    await expect(page).toHaveURL(/\/login$/);
    // The login form is now showing.
    await expect(page.locator('.login-card')).toBeVisible();
  });

  test('visiting /tickets while logged out redirects to /login', async ({ page }) => {
    await page.goto('/#/tickets');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('visiting /opportunities/<unknown-id> while logged out redirects to /login', async ({ page }) => {
    await page.goto('/#/opportunities/00000000-0000-0000-0000-000000000000');
    // RequireAuth -> /login (not the EmptyState detail page; gated routes
    // are unreachable while logged-out, even when supabase is null).
    await expect(page).toHaveURL(/\/login$/);
  });

  test('topnav is NOT rendered for unauthenticated users on the login page', async ({ page }) => {
    await page.goto('/#/login');
    // The login route is OUTSIDE the RequireAuth/Layout wrapper, so no
    // topnav-dark should be present.
    await expect(page.locator('.topnav')).toHaveCount(0);
  });

  test('catch-all unknown path falls back to "/" → /login', async ({ page }) => {
    await page.goto('/#/this/does/not/exist');
    // App.tsx has `<Route path="*" element={<Navigate to="/" replace />}`,
    // and "/" requires auth → redirects to /login.
    await expect(page).toHaveURL(/\/login$/);
  });
});
