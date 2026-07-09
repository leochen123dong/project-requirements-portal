-- ============================================================================
-- Phase 2b: Demo seed data
--
-- Inserts a small, deterministic dataset so the portal renders end-to-end
-- without manually creating projects / milestones / tickets via the UI.
--
-- ─── Setup ─────────────────────────────────────────────────────────────────
-- The portal uses Supabase Auth, so the `auth.users` rows must exist before
-- we can insert matching `profiles` rows. Two ways to create them:
--
--   1) **Recommended for Supabase Dashboard**:
--      Authentication → Users → "Add user" → "Create new user" → enter the
--      email and password, then **edit the UUID** to one of the values below
--      (Supabase exposes the UUID in the row's detail view).
--      Demo accounts:
--        presales@demo.local  → 11111111-1111-1111-1111-111111111111
--        pm@demo.local        → 22222222-2222-2222-2222-222222222222
--        delivery@demo.local  → 33333333-3333-3333-3333-333333333333
--        postsales@demo.local → 44444444-4444-4444-4444-444444444444
--        admin@demo.local     → 55555555-5555-5555-5555-555555555555
--
--   2) **For scripted setups** (e.g. CI), create users via the Admin API and
--      note the UUIDs, then update the constants in this file accordingly.
--
-- Then run this file in the Supabase SQL Editor (or `psql -f supabase/seed.sql`
-- after `supabase db remote commit`). It is idempotent: every INSERT uses
-- `ON CONFLICT DO NOTHING`, so re-running won't duplicate rows.
--
-- The UUIDs below MUST match the auth.users UUIDs — profiles.id is a FK to
-- auth.users.id. See `supabase/migrations/0003_triggers.sql` for the
-- `handle_new_user()` trigger that normally creates profiles automatically;
-- this seed inserts them explicitly so demo accounts exist before any user
-- ever signs in.
-- ============================================================================

-- ─── Demo profiles (5 roles) ───────────────────────────────────────────────
-- display_name uses Chinese to match the demo ROLES.md wording.
insert into public.profiles (id, display_name, role) values
  ('11111111-1111-1111-1111-111111111111', '王售前',     'presales'),
  ('22222222-2222-2222-2222-222222222222', '李项目经理', 'pm'),
  ('33333333-3333-3333-3333-333333333333', '张交付',     'delivery'),
  ('44444444-4444-4444-4444-444444444444', '赵售后',     'postsales'),
  ('55555555-5555-5555-5555-555555555555', '管理员',     'admin')
on conflict (id) do nothing;

-- ─── Opportunities ─────────────────────────────────────────────────────────
-- 1 in 'proposal', 1 in 'won'. Owner is the presales demo user.
insert into public.opportunities (id, name, customer, amount, stage, owner_id) values
  (
    'aaaaaaa1-0000-0000-0000-000000000001',
    '某制造业园区网络安全升级',
    '某科技公司',
    850000.00,
    'proposal',
    '11111111-1111-1111-1111-111111111111'
  ),
  (
    'aaaaaaa1-0000-0000-0000-000000000002',
    '金融客户数据中心扩容',
    '某银行',
    2300000.00,
    'won',
    '11111111-1111-1111-1111-111111111111'
  )
on conflict (id) do nothing;

-- ─── Project (handover of the 'won' opportunity) ──────────────────────────
-- pm_id is the pm demo user. status 'in_progress' so the project timeline
-- component renders meaningfully.
insert into public.projects (id, opportunity_id, name, pm_id, status, ithub_ticket_id) values
  (
    'bbbbbbb1-0000-0000-0000-000000000001',
    'aaaaaaa1-0000-0000-0000-000000000002',
    '该银行数据中心扩容',
    '22222222-2222-2222-2222-222222222222',
    'in_progress',
    'T-1001'
  )
on conflict (id) do nothing;

-- ─── Milestones (3, in order) ───────────────────────────────────────────────
-- due_date uses `current_date + interval` so the timeline stays relevant
-- whenever the seed is re-run.
insert into public.milestones (id, project_id, name, phase, due_date, status, "order") values
  (
    'ccccccc1-0000-0000-0000-000000000001',
    'bbbbbbb1-0000-0000-0000-000000000001',
    '项目启动会',
    'kickoff',
    current_date + interval '7 days',
    'done',
    1
  ),
  (
    'ccccccc1-0000-0000-0000-000000000002',
    'bbbbbbb1-0000-0000-0000-000000000001',
    '方案设计',
    'design',
    current_date + interval '21 days',
    'in_progress',
    2
  ),
  (
    'ccccccc1-0000-0000-0000-000000000003',
    'bbbbbbb1-0000-0000-0000-000000000001',
    '设备到货验收',
    'delivery',
    current_date + interval '45 days',
    'pending',
    3
  )
on conflict (id) do nothing;

-- ─── Tasks (5, spread across the 3 milestones) ─────────────────────────────
-- Mix of done / not-done. Assignees cycle through the 3 delivery-facing
-- demo users (pm, delivery, postsales) so the "my tasks" list shows work
-- for different roles.
insert into public.tasks (id, milestone_id, assignee_id, title, done, due_date) values
  (
    'ddddddd1-0000-0000-0000-000000000001',
    'ccccccc1-0000-0000-0000-000000000001',
    '22222222-2222-2222-2222-222222222222',
    '准备启动会议程',
    true,
    current_date + interval '5 days'
  ),
  (
    'ddddddd1-0000-0000-0000-000000000002',
    'ccccccc1-0000-0000-0000-000000000001',
    '33333333-3333-3333-3333-333333333333',
    '发送邀请邮件给干系人',
    true,
    current_date + interval '6 days'
  ),
  (
    'ddddddd1-0000-0000-0000-000000000003',
    'ccccccc1-0000-0000-0000-000000000002',
    '33333333-3333-3333-3333-333333333333',
    '网络拓扑图初稿',
    false,
    current_date + interval '14 days'
  ),
  (
    'ddddddd1-0000-0000-0000-000000000004',
    'ccccccc1-0000-0000-0000-000000000002',
    '44444444-4444-4444-4444-444444444444',
    '防火墙策略评审',
    false,
    current_date + interval '18 days'
  ),
  (
    'ddddddd1-0000-0000-0000-000000000005',
    'ccccccc1-0000-0000-0000-000000000003',
    '33333333-3333-3333-3333-333333333333',
    '联系供应商确认到货时间',
    false,
    current_date + interval '40 days'
  )
on conflict (id) do nothing;

-- ─── ITHub tickets (3, mock) ───────────────────────────────────────────────
-- Inserted directly so TicketsPage renders without needing the live ITHub
-- API to be reachable. Matches the mock data shape in
-- `web/src/api/ithub.ts` and the ITHubSyncResult that `ithub-sync` returns
-- when ITHUB_MOCK=true. SLA timestamps use fixed offsets from `now()` so
-- the "breach in N hours" math is meaningful.
insert into public.ithub_tickets (id, project_id, ithub_id, subject, status, sla_breach_at, last_synced_at) values
  (
    '00000000-0000-0000-0000-000000000001',
    'bbbbbbb1-0000-0000-0000-000000000001',
    'T-1001',
    '核心交换机故障 — 客户机房',
    'open',
    now() + interval '4 hours',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'bbbbbbb1-0000-0000-0000-000000000001',
    'T-1002',
    '防火墙策略优化请求',
    'in_progress',
    now() + interval '28 hours',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'bbbbbbb1-0000-0000-0000-000000000001',
    'T-0998',
    '服务器扩容 — 已关闭',
    'closed',
    null,
    now()
  )
on conflict (id) do nothing;

-- ─── ITHub sync log (1 entry, baseline) ────────────────────────────────────
-- A single historical row so the admin dashboard's "last sync time" widget
-- has content before the first real sync runs.
insert into public.ithub_sync_log (ran_at, tickets_pulled, errors) values
  (now() - interval '1 hour', 3, null);

-- End of seed.