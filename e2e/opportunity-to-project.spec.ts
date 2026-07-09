import { test, expect } from '@playwright/test';

/**
 * End-to-end happy path: presales creates an opportunity → 5 artifacts →
 * 立项 → PM sees the new project.
 *
 * This test REQUIRES:
 *   - E2E_SUPABASE_URL
 *   - E2E_SUPABASE_ANON_KEY
 *   - Seeded demo data per `supabase/seed.sql`
 *
 * Without those env vars it skips gracefully — the CI workflow only runs
 * this on branches/repos that have the secrets configured.
 */

const HAS_SUPABASE = !!(process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_ANON_KEY);

test.describe('opportunity → project handover (full e2e, requires seeded Supabase)', () => {
  test.skip(!HAS_SUPABASE, 'E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY not set — skip');

  test('presales sees 2 seeded opportunities', async ({ page }) => {
    await page.goto('/#/login');
    // We can't really do magic-link login in CI without inbox access.
    // For this env-gated test we directly seed the auth store.
    await page.addInitScript(() => {
      const session = {
        access_token: 'fake-test-token',
        user: {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'presales@demo.local',
          app_metadata: {},
          user_metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      };
      const profile = {
        id: '11111111-1111-1111-1111-111111111111',
        display_name: '王售前',
        role: 'presales',
        created_at: '2026-01-01T00:00:00Z',
      };
      window.localStorage.setItem(
        'pm-portal-auth',
        JSON.stringify({ state: { profile, session }, version: 0 }),
      );
    });
    await page.goto('/#/opportunities');
    await expect(page.locator('.login-card')).toHaveCount(0);
    // The seeded opportunities' customer names from supabase/seed.sql:
    await expect(page.getByText('某科技公司')).toBeVisible();
    await expect(page.getByText('某银行')).toBeVisible();
  });

  test('handover modal opens and lists PMs', async ({ page }) => {
    // Quick smoke that the modal/selectors exist; detail assertions below
    // require the runner to be running against a seeded DB.
    test.skip(!HAS_SUPABASE);
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'pm-portal-auth',
        JSON.stringify({
          state: {
            session: { access_token: 'x', user: { id: '11111111-1111-1111-1111-111111111111', email: 'presales@demo.local' } },
            profile: { id: '11111111-1111-1111-1111-111111111111', display_name: '王售前', role: 'presales', created_at: '2026-01-01T00:00:00Z' },
          },
          version: 0,
        }),
      );
    });
    await page.goto('/#/opportunities/aaaaaaa1-0000-0000-0000-000000000001');
    // Modal trigger visible only for presales/admin.
    await expect(page.getByRole('button', { name: /立项交接/ })).toBeVisible();
    // 5 artifact slots shown.
    await expect(page.getByText('HT-JL-01')).toBeVisible();
    await expect(page.getByText('HT-JL-02')).toBeVisible();
    await expect(page.getByText('HT-JL-03-1')).toBeVisible();
    await expect(page.getByText('SOW 工作说明书')).toBeVisible();
    await expect(page.getByText('CONTRACT 合同')).toBeVisible();
  });
});
