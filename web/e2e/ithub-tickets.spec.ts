import { test, expect, type Page } from '@playwright/test';

/**
 * ITHub tickets page in demo mode (no Supabase env).
 *
 * The app wraps every protected route in `<RequireAuth>`, so to render
 * `/tickets` we have to provide a fake session. The cleanest way without
 * touching source is to seed the `pm-portal-auth` localStorage entry that
 * the Zustand persist middleware reads on store creation.
 */

const SESSION = {
  access_token: 'fake-test-token',
  refresh_token: '',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: {
    id: '55555555-5555-5555-5555-555555555555',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin@test.local',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  },
};

const PROFILE = {
  id: '55555555-5555-5555-5555-555555555555',
  display_name: '管理员',
  role: 'admin',
  created_at: '2026-01-01T00:00:00Z',
};

async function seedAuth(page: Page) {
  await page.addInitScript(
    ([key, payload]) => {
      window.localStorage.setItem(key, payload);
    },
    ['pm-portal-auth', JSON.stringify({ state: { profile: PROFILE, session: SESSION }, version: 0 })],
  );
}

test.describe('ITHub tickets page (demo mode, no Supabase)', () => {
  test('shows 演示模式 hint and 加载 Mock 数据 button when supabase is null', async ({ page }) => {
    await seedAuth(page);
    await page.goto('/#/tickets');
    // We are past RequireAuth; the page renders the demo-mode branch
    // because `supabase === null` in this test build.
    await expect(page.getByText('演示模式')).toBeVisible();
    await expect(page.getByText(/Supabase 未配置/)).toBeVisible();
    await expect(page.getByRole('button', { name: /加载 Mock 数据/ })).toBeVisible();
    // No cards yet (lastSync is null).
    await expect(page.locator('.sla-countdown')).toHaveCount(0);
  });

  test('clicking 加载 Mock 数据 reveals 3 mock ticket cards with status + SLA', async ({ page }) => {
    await seedAuth(page);
    await page.goto('/#/tickets');

    await page.getByRole('button', { name: /加载 Mock 数据/ }).click();

    // 3 cards rendered — confirmed by subject text and by sla-countdown count
    // (T-0998 is closed and has no SLA, T-1001 and T-1002 do).
    await expect(page.getByText('核心交换机故障 — 客户机房')).toBeVisible();
    await expect(page.getByText('防火墙策略优化请求')).toBeVisible();
    await expect(page.getByText('服务器扩容 — 已关闭')).toBeVisible();

    // At least 2 SLA countdowns visible (open tickets have one).
    const slas = page.locator('.sla-countdown');
    expect(await slas.count()).toBeGreaterThanOrEqual(2);

    // Each SLA countdown must carry one of the 3 tone classes.
    const tones = ['ok', 'warn', 'breached'];
    const slaCount = await slas.count();
    for (let i = 0; i < slaCount; i++) {
      const cls = (await slas.nth(i).getAttribute('class')) ?? '';
      const matched = tones.some((t) => cls.includes(t));
      expect(matched, `SLA #${i} has unexpected class "${cls}"`).toBe(true);
    }
  });
});
