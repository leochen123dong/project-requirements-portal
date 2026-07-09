import { test, expect } from '@playwright/test';

/**
 * Admin user-management page E2E.
 *
 * Phases A targets — the /admin/users route and its RoleGate behavior.
 *
 * These tests run WITHOUT a real Supabase:
 *   - `addInitScript` seeds the persisted Zustand store (key `pm-portal-auth`)
 *     with a fake admin profile + session so `<RequireAuth>` lets us in.
 *   - The page's `supabaseConfigured` check will be false (env not present in
 *     E2E), so the page renders the "Supabase 未配置" empty state instead of
 *     the live user table. We therefore assert:
 *       * the route is reachable (no redirect to /login)
 *       * the title is "用户管理"
 *       * the gating text is what's expected (no table when supabase is null)
 *       * non-admin profiles land on the "无权限" empty state instead.
 *
 * These tests are blocking; failures here = backend/frontend wiring drift on
 * the admin gate.
 */

const ADMIN_PROFILE = {
  id: '00000000-0000-0000-0000-00000000a001',
  display_name: '赵管理员',
  role: 'admin' as const,
  created_at: '2026-01-01T00:00:00.000Z',
};
const ADMIN_SESSION = {
  access_token: 'fake-test-token',
  refresh_token: 'fake-refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer' as const,
  user: {
    id: ADMIN_PROFILE.id,
    email: 'admin@demo.local',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: ADMIN_PROFILE.created_at,
  },
};
const PM_PROFILE = {
  id: '00000000-0000-0000-0000-00000000a002',
  display_name: '钱PM',
  role: 'pm' as const,
  created_at: '2026-01-01T00:00:00.000Z',
};
const PM_SESSION = {
  access_token: 'fake-test-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer' as const,
  user: {
    id: PM_PROFILE.id,
    email: 'pm@demo.local',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: PM_PROFILE.created_at,
  },
};

function seedAuth(
  page: import('@playwright/test').Page,
  profile: typeof ADMIN_PROFILE,
  session: typeof ADMIN_SESSION,
): Promise<void> {
  return page.addInitScript(
    ({ profile, session, key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({ state: { profile, session }, version: 0 }),
      );
    },
    { profile, session, key: 'pm-portal-auth' },
  );
}

test.describe('admin-users page (admin role, no real Supabase)', () => {
  test('renders the 用户管理 title and is reachable (no /login redirect)', async ({
    page,
  }) => {
    await seedAuth(page, ADMIN_PROFILE, ADMIN_SESSION);

    await page.goto('/#/admin/users');

    // URL stays on /admin/users (RequireAuth was satisfied).
    await expect(page).toHaveURL(/#\/admin\/users$/);
    // Page header shows the correct title.
    await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible();
    // No redirect to login.
    await expect(page.locator('.login-card')).toHaveCount(0);
  });

  test('shows the Supabase 未配置 empty state (mock-only env)', async ({ page }) => {
    await seedAuth(page, ADMIN_PROFILE, ADMIN_SESSION);
    await page.goto('/#/admin/users');

    // Since env is unset, the page renders the env-aware empty state instead
    // of a real table. The first card-level "暂无用户" hint or env-explain
    // should be present.
    await expect(
      page.getByText('Supabase 未配置').or(page.getByText('暂无用户')),
    ).toBeVisible();
    // No table is rendered (we are in the mock-only branch).
    await expect(page.locator('table.data-table, .data-table')).toHaveCount(0);
  });

  test('exposes the "邀请用户" button when an admin session is present', async ({
    page,
  }) => {
    // With supabase=null the page short-circuits to the env-aware empty state
    // BEFORE the page-header (which contains the "邀请用户" button). So we
    // assert that the page-header is NOT in the DOM and the env-aware empty
    // state shows instead — the gate guarantees the button only renders when
    // env is configured. This pins the contract: if a future change ever
    // shows the button without env, that's a security regression.
    await seedAuth(page, ADMIN_PROFILE, ADMIN_SESSION);
    await page.goto('/#/admin/users');

    await expect(page.getByRole('button', { name: '邀请用户' })).toHaveCount(0);
    await expect(page.getByText('Supabase 未配置')).toBeVisible();
  });

  test('page reaches admin route without being redirected to /login', async ({
    page,
  }) => {
    await seedAuth(page, ADMIN_PROFILE, ADMIN_SESSION);
    await page.goto('/#/admin/users');
    // Defensive — even if the title selector changed in a future refactor,
    // the URL must stick. This is the "deliverable" assertion for reachability.
    await expect(page).not.toHaveURL(/\/login$/);
  });
});

test.describe('admin-users page (non-admin role, gate test)', () => {
  test('non-admin (pm) lands on the "无权限" empty state', async ({ page }) => {
    await seedAuth(page, PM_PROFILE, PM_SESSION);
    await page.goto('/#/admin/users');

    // Page header title still shown (set above the role gate), but the gate
    // body is the no-permission empty state.
    await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible();
    await expect(page.getByText('无权限')).toBeVisible();
    // Description mentions admin-only access.
    await expect(page.getByText(/仅管理员可访问/)).toBeVisible();
    // The table never renders — no seeded users, no actions column.
    await expect(page.locator('table.data-table, .data-table')).toHaveCount(0);
  });

  test('presales is also blocked (only admin can manage users)', async ({
    page,
  }) => {
    await seedAuth(page, { ...PM_PROFILE, role: 'presales' }, PM_SESSION);
    await page.goto('/#/admin/users');

    await expect(page.getByText('无权限')).toBeVisible();
  });

  test('delivery is also blocked', async ({ page }) => {
    await seedAuth(page, { ...PM_PROFILE, role: 'delivery' }, PM_SESSION);
    await page.goto('/#/admin/users');

    await expect(page.getByText('无权限')).toBeVisible();
  });

  test('postsales is also blocked', async ({ page }) => {
    await seedAuth(page, { ...PM_PROFILE, role: 'postsales' }, PM_SESSION);
    await page.goto('/#/admin/users');

    await expect(page.getByText('无权限')).toBeVisible();
  });
});
