-- ============================================================================
-- Phase 1: Triggers, Realtime publication, updated_at maintenance
--
-- 1. handle_new_user(): after INSERT on auth.users, auto-create a profiles
--    row with display_name derived from the email prefix and a default role
--    of 'pm'. Admins can later promote via service_role.
--
-- 2. audit_trigger_row(): a generic AFTER INSERT/UPDATE/DELETE trigger
--    function that writes to audit_log. Wired to the 6 auditable tables.
--    SECURITY DEFINER so it can write even when the actor's role would
--    forbid direct INSERT.
--
-- 3. set_updated_at(): BEFORE UPDATE trigger on opportunities to maintain
--    the updated_at column.
--
-- 4. ALTER TABLE ... SET REPLICA IDENTITY FULL for milestones/tasks/comments
--    so Realtime can deliver the OLD row in UPDATE/DELETE events (used by
--    ProjectDetailPage for live updates).
--
-- 5. supabase_realtime publication: ensure it exists, then add the three
--    tables so the frontend can .channel(...).on('postgres_changes', ...).
-- ============================================================================

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

-- Drop & recreate so the migration is idempotent.
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

-- Wire the audit trigger to the 6 auditable tables. (profiles is excluded —
-- it's touched on every auth.users insert via handle_new_user and would be
-- noise. audit_log and ithub_sync_log are excluded — they ARE the audit
-- table. ithub_tickets is excluded — written by service_role.)
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
-- Without REPLICA IDENTITY FULL, Postgres only ships the primary key in
-- OLD rows during UPDATE/DELETE replication. Realtime forwards the OLD row
-- as part of its payload, so the frontend can compute diffs. For MVP we
-- only do this on the three tables that Phase 2a subscribes to.

alter table public.milestones replica identity full;
alter table public.tasks     replica identity full;
alter table public.comments  replica identity full;

-- ─── 5. supabase_realtime publication ──────────────────────────────────────
-- Supabase ships with `supabase_realtime` publication pre-created for the
-- realtime extension. We add the three tables defensively (CREATE if missing
-- for local dev).

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end $$;

-- Add tables idempotently. pg_publication_rel has no IF NOT EXISTS for the
-- add, so we wrap each in a check. NOTE: pg_publication_rel has no
-- `pubname` column — we must JOIN pg_publication on oid/prpubid.
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
