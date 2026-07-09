-- ============================================================================
-- Phase 1: Initial schema
--
-- 10 core tables for the Project Requirements Portal MVP, plus indexes that
-- match the expected read patterns from the frontend (Phase 2a).
--
-- Conventions:
--   * snake_case everywhere (matches `web/src/types/contracts.ts` Zod schemas)
--   * UUID PKs via gen_random_uuid() (PG 15 built-in via pgcrypto)
--   * timestamptz for all time columns
--   * CHECK constraints on enums mirror `RoleEnum`, `OpportunityStageEnum`,
--     `ProjectStatusEnum`, `MilestoneStatusEnum`, `ArtifactTypeEnum`,
--     `CommentTargetTypeEnum` from contracts.ts verbatim
--
-- Apply via `supabase db push` or paste into the Supabase SQL Editor.
-- ============================================================================

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
-- Created when presales hands an opportunity over to a PM.
-- `ithub_ticket_id` is a free-form text hook (filled in by ithub-sync Edge
-- Function or manual entry) — there is no FK to ithub_tickets because a
-- project can exist before / without a synced ticket.
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
