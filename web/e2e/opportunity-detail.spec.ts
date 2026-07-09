import { test, expect, type Page } from '@playwright/test';

/**
 * Opportunity detail page E2E — v0.3 Phase D coverage.
 *
 * Targets the three new Phase A/B/C features:
 *   1. Stage change UI (Phase A — "修改阶段" button + modal)
 *   2. Comments / audit timeline (Phase B — "跟进记录 / 日志" section)
 *   3. Tags (Phase C — "标签" chip area + "添加标签" button)
 *
 * These tests run WITHOUT a real Supabase:
 *   - `addInitScript` seeds the persisted Zustand store (key `pm-portal-auth`)
 *     with a fake profile + session so `<RequireAuth>` lets us in.
 *   - The page's `supabaseConfigured` check is false (env not present in E2E),
 *     so the page renders the "Supabase 未配置" empty state instead of the
 *     role-gated detail UI.
 *
 * ─── Constraint (documented for future readers) ────────────────────────────
 * Because Supabase is mocked off in this E2E environment, the role-gated
 * buttons and sections (修改阶段 / 跟进记录 / 标签 / 添加标签 / 立项交接) are
 * never rendered — the page short-circuits to the env-aware empty state
 * before the page body mounts. Behavioural assertions like "presales sees
 * 修改阶段 button" therefore require either:
 *   (a) real Supabase env (E2E_SUPABASE_URL + E2E_SUPABASE_ANON_KEY set +
 *       seed.sql loaded) — covered by `e2e/opportunity-to-project.spec.ts`
 *       which is gated on HAS_SUPABASE, or
 *   (b) a module-level supabase.js mock — out of scope for these tests.
 *
 * What we CAN assert in mock-only mode (and what this spec asserts):
 *   - the route is reachable for both presales and pm (no /login redirect)
 *   - the page header renders with the correct title + "Supabase 未配置" hint
 *   - the env-aware empty state ("需要先连接 Supabase") is shown
 *   - role-gated buttons/sections are ABSENT in env-empty mode (the gate
 *     fires before they would mount; pin this contract so a future refactor
 *     that exposes them without env would be a security regression)
 *   - the page does not redirect presales away or show pm-specific pages
 *
 * The helper-level RBAC matrix (presales+admin can update, pm/delivery/
 * postsales cannot) is exhaustively covered by `web/src/utils/rbac.test.ts`
 * (the canUpdateOpportunity action-helper cell + ROLE_MATRIX row added in
 * Phase D) — those tests pin the gate logic; this spec pins the wiring.
 */

interface Fixtures {
  profile: {
    id: string;
    display_name: string;
    role: 'admin' | 'pm' | 'presales' | 'delivery' | 'postsales';
    created_at: string;
  };
  session: { access_token: string; user: { id: string; email: string } };
}

function fixtureFor(
  role: 'admin' | 'pm' | 'presales' | 'delivery' | 'postsales',
  email: string,
  idSuffix: string,
  displayName: string,
): Fixtures {
  return {
    profile: {
      id: `00000000-0000-0000-0000-${idSuffix.padStart(12, '0')}`,
      display_name: displayName,
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

const PRESALES = fixtureFor('presales', 'presales@demo.local', 'a01', '王售前');
const PM_USER = fixtureFor('pm', 'pm@demo.local', 'a02', '李PM');
// Stable opportunity id — any UUID will do; the page short-circuits to the
// env-empty branch before it touches the database, so the id is never
// resolved by Supabase.
const OPPORTUNITY_ID = '00000000-0000-0000-0000-000000000d01';
const OPPORTUNITY_PATH = `/#/opportunities/${OPPORTUNITY_ID}`;

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

// ─── Reachability + env-empty branch (mock-only) ────────────────────────────

test.describe('opportunity detail (presales, no real Supabase)', () => {
  test('presales can reach /opportunities/:id (no /login redirect)', async ({
    page,
  }) => {
    await seedAuth(page, PRESALES);
    await page.goto(OPPORTUNITY_PATH);

    // URL sticks — RequireAuth was satisfied by the seeded store.
    await expect(page).toHaveURL(/#\/opportunities\/[^/]+$/);
    // Page header title is rendered even in env-empty branch.
    await expect(page.getByRole('heading', { name: '商机详情' })).toBeVisible();
    // No login card rendered.
    await expect(page.locator('.login-card')).toHaveCount(0);
  });

  test('presales sees the "Supabase 未配置" hint + env-empty empty state', async ({
    page,
  }) => {
    await seedAuth(page, PRESALES);
    await page.goto(OPPORTUNITY_PATH);

    // Env-aware empty state — pins the mock-only contract.
    await expect(page.getByText('Supabase 未配置')).toBeVisible();
    await expect(page.getByText('需要先连接 Supabase')).toBeVisible();
  });

  test('presales does NOT see the "修改阶段" button in env-empty branch', async ({
    page,
  }) => {
    // Contract: the "修改阶段" button is rendered inside the page body, which
    // never mounts when `supabase` is null. Pinning this here means a future
    // refactor that moves the button above the env gate would fail loudly
    // — that's the security regression we want to catch.
    await seedAuth(page, PRESALES);
    await page.goto(OPPORTUNITY_PATH);

    await expect(page.getByRole('button', { name: '修改阶段' })).toHaveCount(0);
  });

  test('presales does NOT see the "立项交接" button in env-empty branch', async ({
    page,
  }) => {
    // Same env-gate contract as above, but for the pre-existing handover
    // button — the new code should NOT accidentally move it outside the
    // gate either.
    await seedAuth(page, PRESALES);
    await page.goto(OPPORTUNITY_PATH);

    await expect(page.getByRole('button', { name: /立项交接/ })).toHaveCount(0);
  });

  test('presales does NOT see the "添加标签" button in env-empty branch', async ({
    page,
  }) => {
    // "添加标签" lives inside the page body alongside the tag chip area.
    // In env-empty mode the body never mounts, so the button must be absent.
    await seedAuth(page, PRESALES);
    await page.goto(OPPORTUNITY_PATH);

    await expect(page.getByRole('button', { name: '添加标签' })).toHaveCount(0);
  });

  test('presales does NOT see the "跟进记录 / 日志" section in env-empty branch', async ({
    page,
  }) => {
    // The merged-timeline section is rendered inside the page body, after
    // the env gate. In env-empty mode the section is absent — the page
    // shows only the env-aware empty state.
    await seedAuth(page, PRESALES);
    await page.goto(OPPORTUNITY_PATH);

    await expect(page.getByText('跟进记录 / 日志')).toHaveCount(0);
    await expect(page.getByText('暂无跟进记录')).toHaveCount(0);
  });
});

test.describe('opportunity detail (pm, no real Supabase)', () => {
  test('pm can reach /opportunities/:id (no /login redirect)', async ({
    page,
  }) => {
    await seedAuth(page, PM_USER);
    await page.goto(OPPORTUNITY_PATH);

    // pm is allowed to view the opportunities page (PAGE_PERMISSIONS includes
    // 'pm'), so RequireAuth + the route gate both pass.
    await expect(page).toHaveURL(/#\/opportunities\/[^/]+$/);
    await expect(page.getByRole('heading', { name: '商机详情' })).toBeVisible();
    await expect(page.locator('.login-card')).toHaveCount(0);
  });

  test('pm sees the same env-empty branch as presales', async ({
    page,
  }) => {
    await seedAuth(page, PM_USER);
    await page.goto(OPPORTUNITY_PATH);

    // The env-empty branch is role-agnostic — the page gate runs before
    // the role-aware UI would branch. Both roles see the same hint.
    await expect(page.getByText('Supabase 未配置')).toBeVisible();
    await expect(page.getByText('需要先连接 Supabase')).toBeVisible();
  });

  test('pm does NOT see the "修改阶段" button in env-empty branch', async ({
    page,
  }) => {
    // pm fails the canUpdateOpportunity() gate (helper returns false for pm),
    // AND in mock-only mode the env gate fires first. Pinning both facts:
    //   (a) the button is absent (env gate)
    //   (b) this is the contract we want — a future change that lets pm
    //       reach the button would be a privilege regression.
    await seedAuth(page, PM_USER);
    await page.goto(OPPORTUNITY_PATH);

    await expect(page.getByRole('button', { name: '修改阶段' })).toHaveCount(0);
  });

  test('pm does NOT see the "添加标签" button (env gate)', async ({
    page,
  }) => {
    await seedAuth(page, PM_USER);
    await page.goto(OPPORTUNITY_PATH);

    await expect(page.getByRole('button', { name: '添加标签' })).toHaveCount(0);
  });

  test('pm does NOT see the "立项交接" button (pm is not allowed to handover)', async ({
    page,
  }) => {
    // pm has zero handover permission per the RBAC matrix, so this would be
    // absent even with real Supabase. The env gate reinforces it for now.
    await seedAuth(page, PM_USER);
    await page.goto(OPPORTUNITY_PATH);

    await expect(page.getByRole('button', { name: /立项交接/ })).toHaveCount(0);
  });

  test('pm does NOT see the "跟进记录 / 日志" section in env-empty branch', async ({
    page,
  }) => {
    // The 日志 section is role-agnostic in the page body — presales and pm
    // both get it when supabase is configured (pm sees comments via the
    // generic comments SELECT policy; the audit_log half is RLS-denied for
    // pm in real Supabase, but the section header is still rendered with
    // only the comment side populated). In env-empty mode the section
    // doesn't mount at all.
    await seedAuth(page, PM_USER);
    await page.goto(OPPORTUNITY_PATH);

    await expect(page.getByText('跟进记录 / 日志')).toHaveCount(0);
  });
});

// ─── Documented constraint: behavioural assertions require real Supabase ──
// The tests above pin the mock-only contract. The behavioural assertions
// (modify-stage modal opens, tag chip is rendered, comment is posted, audit
// entry appears) require real Supabase data. They're covered by
// `e2e/opportunity-to-project.spec.ts` (which `test.skip(!HAS_SUPABASE)`'s)
// and would be re-enabled here in a follow-up spec once a supabase.js mock
// harness is in place.