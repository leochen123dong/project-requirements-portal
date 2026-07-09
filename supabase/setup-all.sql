-- ============================================================================
-- 项目需求管理门户 · 一键初始化脚本
--
-- 用法:
--   1. Supabase Dashboard → SQL Editor → + New query
--   2. 复制本文件全部内容粘贴进去
--   3. 点 Run(或 Cmd/Ctrl + Enter)
--   4. 应看到 "Success. No rows returned"
--
-- 内容顺序:
--   A. 0001_init.sql     — 10 张表 + 索引
--   B. 0002_rls.sql     — RLS 策略(current_role() helper)
--   C. 0003_triggers.sql — auth trigger + audit + realtime publication
--
-- 完成后:
--   - 左侧 Table Editor 应看到 10 张表
--   - 左侧 Database → Replication 应有 supabase_realtime publication
--   - 左侧 Database → Functions 应有 handle_new_user / audit_trigger_row /
--     set_updated_at / current_role 四个函数
--
-- 常见失败:
--   - "permission denied" → 在 SQL Editor 顶部确认选的是你的项目,不是 public
--   - "relation auth.users does not exist" → 同上,SQL Editor 必须在项目里
--
-- 创建 demo 用户见 README 第 8 步(Authentication → Users → Add user)。
-- ============================================================================


-- ████████████████████████████████████████████████████████████████████████████
-- ██  A. 0001_init.sql  —  10 张表                                          ██
-- ████████████████████████████████████████████████████████████████████████████

-- gen_random_uuid lives in pgcrypto on PG 13; Supabase enables it by default
-- but we guard for local dev environments that may not.
create extension if not exists "pgcrypto";

-- ─── profiles ───────────────────────────────────────────────────────────────
-- 1:1 with auth.users.id. Created automatically by the trigger in
-- 0003_triggers.sql after a user signs up.
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  role          text not null
                  check (role in ('presales','pm','delivery','postsales','admin')),
  created_at    timestamptz not null default now()
);

-- ─── opportunities ──────────────────────────────────────────────────────────
-- Owned by a presales (or admin). MVP visibility: all authenticated users can
-- see all rows (RBAC matrix simplification — documented in 0002_rls.sql).
create table if not exists public.opportunities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  customer    text not null,
  amount      numeric(14,2),
  stage       text not null
                check (stage in ('lead','qualified','proposal','negotiation','won','lost'))
                default 'lead',
  owner_id    uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists opportunities_owner_id_idx on public.opportunities(owner_id);
create index if not exists opportunities_stage_idx    on public.opportunities(stage);

-- ─── projects ───────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),
  opportunity_id    uuid not null references public.opportunities(id),
  name              text not null,
  pm_id             uuid not null references public.profiles(id),
  status            text not null
                      check (status in ('initiated','in_progress','accepted','closed'))
                      default 'initiated',
  ithub_ticket_id   text,
  created_at        timestamptz not null default now()
);
create index if not exists projects_opportunity_id_idx on public.projects(opportunity_id);
create index if not exists projects_pm_id_idx          on public.projects(pm_id);
create index if not exists projects_status_idx         on public.projects(status);

-- ─── milestones ─────────────────────────────────────────────────────────────
create table if not exists public.milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null,
  phase       text not null,
  due_date    date not null,
  status      text not null
                check (status in ('pending','in_progress','done','blocked'))
                default 'pending',
  "order"     int  not null default 0
);
create index if not exists milestones_project_id_order_idx
  on public.milestones(project_id, "order");

-- ─── tasks ──────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones(id) on delete cascade,
  assignee_id  uuid not null references public.profiles(id),
  title        text not null,
  done         boolean not null default false,
  due_date     date
);
create index if not exists tasks_milestone_id_idx       on public.tasks(milestone_id);
create index if not exists tasks_assignee_id_done_idx   on public.tasks(assignee_id, done);

-- ─── comments ───────────────────────────────────────────────────────────────
-- Polymorphic: target_type + target_id. No FK (target_id can point to any of
-- 4 entity tables), enforced at write-time by application code.
create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null
                  check (target_type in ('opportunity','project','milestone','task')),
  target_id    uuid not null,
  author_id    uuid not null references public.profiles(id),
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists comments_target_type_target_id_idx
  on public.comments(target_type, target_id);

-- ─── artifacts ──────────────────────────────────────────────────────────────
-- Uploaded files linked to a project. storage_path is a Supabase Storage
-- object key (NOT a public URL — the app resolves to a signed URL at view time).
create table if not exists public.artifacts (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  type          text not null
                  check (type in ('HT-JL-01','HT-JL-02','HT-JL-03-1','SOW','CONTRACT')),
  storage_path  text not null,
  uploaded_by   uuid not null references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists artifacts_project_id_type_idx
  on public.artifacts(project_id, type);

-- ─── audit_log ──────────────────────────────────────────────────────────────
-- Append-only. INSERTs come from the trigger in 0003_triggers.sql (which
-- runs with definer privileges, bypassing RLS). SELECT is admin-only.
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id),
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  at          timestamptz not null default now()
);

-- ─── ithub_tickets ──────────────────────────────────────────────────────────
-- Mirror of ITHub tickets we track for SLA. Written by the ithub-sync Edge
-- Function (service_role bypasses RLS); read by authenticated users.
create table if not exists public.ithub_tickets (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  ithub_id         text not null unique,
  subject          text not null,
  status           text not null,
  sla_breach_at    timestamptz,
  last_synced_at   timestamptz not null default now()
);
create index if not exists ithub_tickets_project_id_idx       on public.ithub_tickets(project_id);
create index if not exists ithub_tickets_status_idx           on public.ithub_tickets(status);
create index if not exists ithub_tickets_sla_breach_at_idx   on public.ithub_tickets(sla_breach_at);

-- ─── ithub_sync_log ─────────────────────────────────────────────────────────
-- One row per sync run (full or incremental). Written by the ithub-sync Edge
-- Function with service_role. Read-only for admins.
create table if not exists public.ithub_sync_log (
  id              uuid primary key default gen_random_uuid(),
  ran_at          timestamptz not null default now(),
  tickets_pulled  int not null default 0,
  errors          text
);


-- ████████████████████████████████████████████████████████████████████████████
-- ██  B. 0002_rls.sql  —  RLS 策略                                         ██
-- ████████████████████████████████████████████████████████████████████████████

-- ─── Helper function ────────────────────────────────────────────────────────
create or replace function public.current_role()
returns text
language sql
security definer   -- runs with owner privileges, bypasses RLS on profiles
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ─── profiles ───────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

create policy "profiles_select_self_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.current_role() = 'admin');

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─── opportunities ──────────────────────────────────────────────────────────
alter table public.opportunities enable row level security;

create policy "opportunities_select_all"
  on public.opportunities for select
  to authenticated
  using (true);

create policy "opportunities_insert_presales_admin"
  on public.opportunities for insert
  to authenticated
  with check (public.current_role() in ('presales','admin'));

create policy "opportunities_update_presales_admin"
  on public.opportunities for update
  to authenticated
  using (public.current_role() in ('presales','admin'))
  with check (public.current_role() in ('presales','admin'));

create policy "opportunities_delete_owner_or_admin"
  on public.opportunities for delete
  to authenticated
  using (owner_id = auth.uid() or public.current_role() = 'admin');

-- ─── projects ───────────────────────────────────────────────────────────────
alter table public.projects enable row level security;

create policy "projects_select_all"
  on public.projects for select
  to authenticated
  using (true);

create policy "projects_insert_pm_admin"
  on public.projects for insert
  to authenticated
  with check (public.current_role() in ('pm','admin'));

create policy "projects_update_pm_admin"
  on public.projects for update
  to authenticated
  using (public.current_role() in ('pm','admin'))
  with check (public.current_role() in ('pm','admin'));

-- ─── milestones ─────────────────────────────────────────────────────────────
alter table public.milestones enable row level security;

create policy "milestones_select_all"
  on public.milestones for select
  to authenticated
  using (true);

create policy "milestones_insert_pm_admin"
  on public.milestones for insert
  to authenticated
  with check (public.current_role() in ('pm','admin'));

create policy "milestones_update_pm_admin"
  on public.milestones for update
  to authenticated
  using (public.current_role() in ('pm','admin'))
  with check (public.current_role() in ('pm','admin'));

create policy "milestones_delete_pm_admin"
  on public.milestones for delete
  to authenticated
  using (public.current_role() in ('pm','admin'));

-- ─── tasks ──────────────────────────────────────────────────────────────────
alter table public.tasks enable row level security;

create policy "tasks_select_all"
  on public.tasks for select
  to authenticated
  using (true);

create policy "tasks_insert_pm_delivery_admin"
  on public.tasks for insert
  to authenticated
  with check (public.current_role() in ('pm','delivery','admin'));

create policy "tasks_update_assignee_pm_admin"
  on public.tasks for update
  to authenticated
  using (
    assignee_id = auth.uid()
    or public.current_role() in ('pm','admin')
  )
  with check (
    assignee_id = auth.uid()
    or public.current_role() in ('pm','admin')
  );

-- ─── comments ───────────────────────────────────────────────────────────────
alter table public.comments enable row level security;

create policy "comments_select_all"
  on public.comments for select
  to authenticated
  using (true);

create policy "comments_insert_authenticated"
  on public.comments for insert
  to authenticated
  with check (author_id = auth.uid());

-- ─── artifacts ──────────────────────────────────────────────────────────────
alter table public.artifacts enable row level security;

create policy "artifacts_select_all"
  on public.artifacts for select
  to authenticated
  using (true);

create policy "artifacts_insert_presales_pm_admin"
  on public.artifacts for insert
  to authenticated
  with check (public.current_role() in ('presales','pm','admin'));

create policy "artifacts_update_presales_pm_admin"
  on public.artifacts for update
  to authenticated
  using (public.current_role() in ('presales','pm','admin'))
  with check (public.current_role() in ('presales','pm','admin'));

create policy "artifacts_delete_presales_pm_admin"
  on public.artifacts for delete
  to authenticated
  using (public.current_role() in ('presales','pm','admin'));

-- ─── audit_log ──────────────────────────────────────────────────────────────
alter table public.audit_log enable row level security;

create policy "audit_log_select_admin"
  on public.audit_log for select
  to authenticated
  using (public.current_role() = 'admin');

-- ─── ithub_tickets ──────────────────────────────────────────────────────────
alter table public.ithub_tickets enable row level security;

create policy "ithub_tickets_select_all"
  on public.ithub_tickets for select
  to authenticated
  using (true);

-- ─── ithub_sync_log ─────────────────────────────────────────────────────────
alter table public.ithub_sync_log enable row level security;

create policy "ithub_sync_log_select_admin"
  on public.ithub_sync_log for select
  to authenticated
  using (public.current_role() = 'admin');


-- ████████████████████████████████████████████████████████████████████████████
-- ██  C. 0003_triggers.sql  —  auth trigger + audit + realtime             ██
-- ████████████████████████████████████████████████████████████████████████████

-- ─── 1. handle_new_user (auth.users → public.profiles) ──────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer   -- runs as the function owner so it can bypass profiles RLS
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(
      split_part(new.email, '@', 1),  -- e.g. 'presales' from presales@demo.local
      'user'
    ),
    'pm'  -- default; admin promotes later via Supabase dashboard or SQL
  )
  on conflict (id) do nothing;  -- idempotent if trigger fires twice
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── 2. audit_trigger_row (generic AFTER trigger for 6 tables) ──────────────

create or replace function public.audit_trigger_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_entity text := tg_table_name;
  v_entity_id uuid;
  v_actor uuid := auth.uid();
begin
  if (tg_op = 'INSERT') then
    v_action := 'insert';
    v_entity_id := (to_jsonb(new) ->> 'id')::uuid;
    insert into public.audit_log (actor_id, action, entity, entity_id, at)
    values (v_actor, v_action, v_entity, v_entity_id, now());
    return new;
  elsif (tg_op = 'UPDATE') then
    v_action := 'update';
    v_entity_id := (to_jsonb(new) ->> 'id')::uuid;
    insert into public.audit_log (actor_id, action, entity, entity_id, at)
    values (v_actor, v_action, v_entity, v_entity_id, now());
    return new;
  elsif (tg_op = 'DELETE') then
    v_action := 'delete';
    v_entity_id := (to_jsonb(old) ->> 'id')::uuid;
    insert into public.audit_log (actor_id, action, entity, entity_id, at)
    values (v_actor, v_action, v_entity, v_entity_id, now());
    return old;
  end if;
  return null;
end;
$$;

-- Wire the audit trigger to the 6 auditable tables.
do $$
declare
  t text;
  tables text[] := array[
    'opportunities',
    'projects',
    'milestones',
    'tasks',
    'comments',
    'artifacts'
  ];
begin
  foreach t in array tables loop
    execute format(
      'drop trigger if exists %I_audit on public.%I', t, t
    );
    execute format(
      'create trigger %I_audit
         after insert or update or delete on public.%I
         for each row execute function public.audit_trigger_row()',
      t, t
    );
  end loop;
end $$;

-- ─── 3. set_updated_at for opportunities ───────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists opportunities_set_updated_at on public.opportunities;

create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

-- ─── 4. Realtime: REPLICA IDENTITY FULL ────────────────────────────────────

alter table public.milestones replica identity full;
alter table public.tasks     replica identity full;
alter table public.comments  replica identity full;

-- ─── 5. supabase_realtime publication ──────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end $$;

-- Add tables idempotently. NOTE: pg_publication_rel has no `pubname`
-- column — must JOIN pg_publication on oid/prpubid.
do $$
begin
  if not exists (
    select 1
    from pg_publication_rel r
    join pg_publication p on p.oid = r.prpubid
    where p.pubname = 'supabase_realtime'
      and r.prrelid = 'public.milestones'::regclass
  ) then
    alter publication supabase_realtime add table public.milestones;
  end if;

  if not exists (
    select 1
    from pg_publication_rel r
    join pg_publication p on p.oid = r.prpubid
    where p.pubname = 'supabase_realtime'
      and r.prrelid = 'public.tasks'::regclass
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;

  if not exists (
    select 1
    from pg_publication_rel r
    join pg_publication p on p.oid = r.prpubid
    where p.pubname = 'supabase_realtime'
      and r.prrelid = 'public.comments'::regclass
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;

-- ============================================================================
-- END OF SETUP
--
-- Verification queries (run separately to confirm):
--   select tablename from pg_tables where schemaname = 'public' order by 1;
--     -- expect: 10 rows (profiles, opportunities, projects, milestones,
--     --          tasks, comments, artifacts, audit_log,
--     --          ithub_tickets, ithub_sync_log)
--
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--     order by 1;
--     -- expect: audit_trigger_row, current_role, handle_new_user,
--     --          set_updated_at (4 functions)
--
--   select pubname, tablename from pg_publication_rel
--     join pg_publication using (pubname)
--     where pubname = 'supabase_realtime' order by tablename;
--     -- expect: 3 rows (milestones, tasks, comments)
-- ============================================================================