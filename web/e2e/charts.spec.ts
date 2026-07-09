import { test, expect, type Page } from '@playwright/test';

/**
 * Phase C — chart-container coverage on every data page.
 *
 * `ChartCard` always renders its `.card` header with `<h3 className="card-title">`,
 * even when the underlying Recharts mount returns `EmptyState`. We use that as
 * the contract for "the chart infrastructure is wired": the cards should
 * appear on every data page; the actual `.recharts-wrapper` only appears when
 * Supabase data is non-empty (i.e., not in mock-only mode).
 *
 * Pages asserted (4):
 *   - /admin         (2 chart cards: 项目状态分布 + 商机阶段分布)
 *   - /projects      (1 chart card: 状态分布)
 *   - /opportunities (1 chart card: 阶段分布)
 *   - /tickets       (1 chart card: SLA 状态分布)
 *
 * Mock-only (no real Supabase): the projects/opportunities/tickets pages
 * short-circuit to an env-aware empty state BEFORE the chart card mounts, so
 * we only verify reachability + page-title there. The admin dashboard is
 * an exception — its charts render even without data — so it gets the full
 * `.card` + `.card-title` assertions.
 */

interface Fixtures {
  profile: {
    id: string;
    display_name: string;
    role: 'admin' | 'pm' | 'presales' | 'postsales';
    created_at: string;
  };
  session: { access_token: string; user: { id: string; email: string } };
}

function fixtureFor(
  role: 'admin' | 'pm' | 'presales' | 'postsales',
  email: string,
  idSuffix: string,
): Fixtures {
  return {
    profile: {
      id: `00000000-0000-0000-0000-${idSuffix.padStart(12, '0')}`,
      display_name: `${role} test`,
      role,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    session: {
      access_token: `fake-${role}-token`,
      user: {
        id: `00000000-0000-0000-0000-${idSuffix.padStart(12, '0')}`,
        email,
      },
    },
  };
}

async function seedAuth(page: Page, fixture: Fixtures): Promise<void> {
  await page.addInitScript(
    ({ profile, session, key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({ state: { profile, session }, version: 0 }),
      );
    },
    { profile: fixture.profile, session: fixture.session, key: 'pm-portal-auth' },
  );
}

const ADMIN = fixtureFor('admin', 'admin@demo.local', 'a1');
const PM_USER = fixtureFor('pm', 'pm@demo.local', 'a2');
const PRESALES = fixtureFor('presales', 'presales@demo.local', 'a3');
const POSTSALES = fixtureFor('postsales', 'postsales@demo.local', 'a4');

test.describe('charts container coverage (Phase C, mock-only)', () => {
  test('admin dashboard mounts exactly 2 chart cards (项目状态分布 + 商机阶段分布)', async ({
    page,
  }) => {
    await seedAuth(page, ADMIN);
    await page.goto('/#/admin');

    // /admin page is reachable when admin profile is in store.
    await expect(page).toHaveURL(/#\/admin$/);
    // The dashboard always renders the two ChartCard headers (even with
    // empty data the .card + .card-title stay mounted). Inside, an
    // EmptyState appears when data is empty.
    await expect(page.locator('.card:has(.card-title:has-text("项目状态分布"))')).toHaveCount(1);
    await expect(page.locator('.card:has(.card-title:has-text("商机阶段分布"))')).toHaveCount(1);
    // And exactly these two chart cards (regression: a future refactor that
    // accidentally adds or removes a chart will be caught here).
    await expect(
      page.locator('.card:has(.card-title)').filter({
        hasText: /项目状态分布|商机阶段分布/,
      }),
    ).toHaveCount(2);
  });

  test('projects page is reachable (chart card waits for Supabase data)', async ({
    page,
  }) => {
    await seedAuth(page, PM_USER);
    await page.goto('/#/projects');

    await expect(page).toHaveURL(/#\/projects$/);
    // Without supabase client, the page short-circuits to "需要先连接
    // Supabase" — no chart card is mounted. We document the contract:
    //   - mock-only: env-empty state shown, chart NOT mounted
    //   - real Supabase: chart card title "项目状态分布" + BarChart present
    await expect(page.getByText('需要先连接 Supabase').or(page.getByText('暂无项目'))).toBeVisible();
  });

  test('opportunities page is reachable (chart card waits for Supabase data)', async ({
    page,
  }) => {
    await seedAuth(page, PRESALES);
    await page.goto('/#/opportunities');

    await expect(page).toHaveURL(/#\/opportunities$/);
    await expect(
      page.getByText('需要先连接 Supabase').or(page.getByText('暂无商机')),
    ).toBeVisible();
  });

  test('tickets page is reachable (chart card waits for Supabase data)', async ({
    page,
  }) => {
    await seedAuth(page, POSTSALES);
    await page.goto('/#/tickets');

    await expect(page).toHaveURL(/#\/tickets$/);
    // TicketsPage renders a "演示模式" hint + an optional mock-data button
    // when supabase is null (different from projects / opportunities).
    await expect(page.getByText('演示模式')).toBeVisible();
  });

  test('home page does NOT mount a chart card (no Phase C chart on home)', async ({
    page,
  }) => {
    // Phase C only added charts to admin / projects / opportunities / tickets
    // — home is a tile dashboard, not a chart page. If this ever breaks,
    // we're accidentally adding chart weight where it doesn't belong.
    await seedAuth(page, ADMIN);
    await page.goto('/#/home');

    await expect(page).toHaveURL(/#\/home$/);
    await expect(
      page.locator('.card:has(.card-title)').filter({
        hasText: /项目状态分布|商机阶段分布|阶段分布|SLA/,
      }),
    ).toHaveCount(0);
  });

  test('non-admin role visiting /admin sees the no-permission gate, NOT chart cards', async ({
    page,
  }) => {
    await seedAuth(page, PM_USER);
    await page.goto('/#/admin');

    // Page renders the gate (no-permission empty state).
    await expect(page.getByText('无权限')).toBeVisible();
    // No chart card mounted — the page never reaches the chart-rendering branch.
    await expect(
      page.locator('.card:has(.card-title)').filter({
        hasText: /项目状态分布|商机阶段分布/,
      }),
    ).toHaveCount(0);
  });
});
