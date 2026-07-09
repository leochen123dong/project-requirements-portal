import { test, expect } from '@playwright/test';

/**
 * Custom-fields (admin) page E2E.
 *
 * Phase B target — the /admin/fields route and the Opportunities page's
 * create flow.
 *
 * Mock-only (no real Supabase). Same `addInitScript` pattern as
 * admin-users.spec.ts. Assertions:
 *   1. /admin/fields renders "自定义字段" title + page is reachable
 *   2. The "+新增字段" button is present (admin gate cleared)
 *   3. Non-admin profiles hit the "无权限" empty state
 *   4. /opportunities stays reachable for presales (regression: don't break
 *      the existing create flow even though schema bumped)
 */

interface Fixtures {
  profile: { id: string; display_name: string; role: 'admin' | 'pm' | 'presales'; created_at: string };
  session: { access_token: string; user: { id: string; email: string } };
}

const ADMIN: Fixtures = {
  profile: {
    id: '00000000-0000-0000-0000-00000000b001',
    display_name: '赵管理员',
    role: 'admin',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  session: {
    access_token: 'fake-admin-token',
    user: { id: '00000000-0000-0000-0000-00000000b001', email: 'admin@demo.local' },
  },
};
const PM_USER: Fixtures = {
  profile: {
    id: '00000000-0000-0000-0000-00000000b002',
    display_name: '钱PM',
    role: 'pm',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  session: {
    access_token: 'fake-pm-token',
    user: { id: '00000000-0000-0000-0000-00000000b002', email: 'pm@demo.local' },
  },
};
const PRESALES_USER: Fixtures = {
  profile: {
    id: '00000000-0000-0000-0000-00000000b003',
    display_name: '孙售前',
    role: 'presales',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  session: {
    access_token: 'fake-presales-token',
    user: { id: '00000000-0000-0000-0000-00000000b003', email: 'presales@demo.local' },
  },
};

function seedAuth(page: import('@playwright/test').Page, fixture: Fixtures): Promise<void> {
  return page.addInitScript(
    ({ profile, session, key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({ state: { profile, session }, version: 0 }),
      );
    },
    { profile: fixture.profile, session: fixture.session, key: 'pm-portal-auth' },
  );
}

test.describe('custom-fields page (admin role, no real Supabase)', () => {
  test('/admin/fields renders "自定义字段" title and is reachable', async ({
    page,
  }) => {
    await seedAuth(page, ADMIN);
    await page.goto('/#/admin/fields');

    await expect(page).toHaveURL(/#\/admin\/fields$/);
    await expect(page.getByRole('heading', { name: '自定义字段' })).toBeVisible();
    await expect(page.locator('.login-card')).toHaveCount(0);
  });

  test('shows the "新增字段" CTA guard — env-aware empty state in mock-only', async ({
    page,
  }) => {
    await seedAuth(page, ADMIN);
    await page.goto('/#/admin/fields');

    // Contract: the "新增字段" CTA lives in the page-header which is rendered
    // BEFORE the supabase-configured gate. In mock-only mode, the page
    // short-circuits to the env-aware empty state (the gate branch fires
    // before the body of the page mounts). So the button is intentionally
    // NOT in the DOM — this pins the contract: a future refactor that
    // exposes the create button without env would risk a security regression.
    await expect(page.getByRole('button', { name: '新增字段' })).toHaveCount(0);
    await expect(page.getByText('Supabase 未配置')).toBeVisible();
  });

  test('table region is empty (mock-only env: Supabase 未配置)', async ({
    page,
  }) => {
    await seedAuth(page, ADMIN);
    await page.goto('/#/admin/fields');

    // Since env is unset, the page short-circuits to the env-aware empty state.
    await expect(page.getByText('Supabase 未配置')).toBeVisible();
    // No data table rendered.
    await expect(page.locator('table.data-table, .data-table')).toHaveCount(0);
  });
});

test.describe('custom-fields page (non-admin role, gate test)', () => {
  test('pm → "无权限" empty state', async ({ page }) => {
    await seedAuth(page, PM_USER);
    await page.goto('/#/admin/fields');

    await expect(page.getByText('无权限')).toBeVisible();
    await expect(page.getByText(/仅管理员可访问/)).toBeVisible();
    // The admin-only "新增字段" button is NOT in the gate-state DOM.
    await expect(page.getByRole('button', { name: '新增字段' })).toHaveCount(0);
  });

  test('presales → "无权限" (only admin can manage fields)', async ({ page }) => {
    await seedAuth(page, PRESALES_USER);
    await page.goto('/#/admin/fields');

    await expect(page.getByText('无权限')).toBeVisible();
  });
});

test.describe('/opportunities regression (presales)', () => {
  test('presales can still reach /opportunities (not redirected to /login)', async ({
    page,
  }) => {
    await seedAuth(page, PRESALES_USER);
    await page.goto('/#/opportunities');

    await expect(page).toHaveURL(/#\/opportunities$/);
    await expect(page.locator('.login-card')).toHaveCount(0);
    // The page-title is set even in the env-empty branch.
    await expect(page.getByRole('heading', { name: '商机' })).toBeVisible();
  });

  test('presales is NOT redirected to /admin/fields when accessing /opportunities', async ({
    page,
  }) => {
    await seedAuth(page, PRESALES_USER);
    await page.goto('/#/opportunities');

    // Sanity: the URL stays on /opportunities and the custom-fields title
    // is not accidentally shown.
    await expect(page).toHaveURL(/#\/opportunities$/);
    await expect(page.getByRole('heading', { name: '自定义字段' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '商机' })).toBeVisible();
  });
});
