-- ============================================================================
-- Phase 1: Row-Level Security
--
-- Mirrors the matrix in docs/ROLES.md (source of truth) and web/src/utils/rbac.ts
-- (frontend gate, kept in sync). Every table has at least SELECT restricted
-- to authenticated users, except audit_log / ithub_sync_log which are
-- admin-only.
--
-- MVP scope note:
--   We intentionally do NOT create a `project_members` join table. The RBAC
--   matrix in docs/ROLES.md defers "relevant projects" to `projects.pm_id`
--   only. This is documented here and in 0002 comments. When membership grows
--   beyond the single-PM model, we'll add `project_members` and migrate.
--
-- Helper: `public.current_role()` returns the role of the calling user, or
-- NULL if they have no profile row (still authenticated, just not in profiles).
-- Used in policy USING clauses so we don't have to JOIN profiles in each
-- policy expression.
-- ============================================================================

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

-- Anyone authenticated can SELECT their own row; admin can SELECT all.
create policy "profiles_select_self_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.current_role() = 'admin');

-- UPDATE only your own row, and only the display_name (NOT role — role
-- changes are an admin operation performed by service_role).
create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- INSERT/DELETE not allowed via API — profiles are created by the
-- handle_new_user trigger (0003_triggers.sql) and only deleted via auth.users
-- cascade. No explicit policy needed because RLS denies by default.

-- ─── opportunities ──────────────────────────────────────────────────────────
alter table public.opportunities enable row level security;

-- MVP: all authenticated users can see all opportunities (visibility is
-- simplified for the 7-stage handover workflow).
create policy "opportunities_select_all"
  on public.opportunities for select
  to authenticated
  using (true);

-- presales or admin can INSERT (on their own behalf).
create policy "opportunities_insert_presales_admin"
  on public.opportunities for insert
  to authenticated
  with check (public.current_role() in ('presales','admin'));

-- presales or admin can UPDATE any row (presales can update their own
-- opportunities + admin can update anyone's).
create policy "opportunities_update_presales_admin"
  on public.opportunities for update
  to authenticated
  using (public.current_role() in ('presales','admin'))
  with check (public.current_role() in ('presales','admin'));

-- Only owner or admin can DELETE.
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

-- pm + admin can INSERT (typically from the handover trigger — see
-- OpportunityDetailPage). presales CANNOT insert projects directly; they
-- drive creation via the handover flow.
create policy "projects_insert_pm_admin"
  on public.projects for insert
  to authenticated
  with check (public.current_role() in ('pm','admin'));

create policy "projects_update_pm_admin"
  on public.projects for update
  to authenticated
  using (public.current_role() in ('pm','admin'))
  with check (public.current_role() in ('pm','admin'));

-- No DELETE policy — projects are append-only in MVP (use status='closed').

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

-- pm + delivery + admin can INSERT (delivery is allowed because delivery
-- engineers can create their own sub-tasks per the RBAC matrix).
create policy "tasks_insert_pm_delivery_admin"
  on public.tasks for insert
  to authenticated
  with check (public.current_role() in ('pm','delivery','admin'));

-- Assignee (the person doing the work), or pm/admin can UPDATE.
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

-- Any authenticated user can comment; author_id must be themselves.
create policy "comments_insert_authenticated"
  on public.comments for insert
  to authenticated
  with check (author_id = auth.uid());

-- No UPDATE/DELETE — comments are immutable once posted (audit trail).

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
-- Admin-only SELECT. INSERT happens via the audit_trigger_row() function
-- (defined in 0003_triggers.sql) which is SECURITY DEFINER — its writes
-- bypass RLS. There is NO policy for INSERT, so non-trigger attempts fail.
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

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- The ithub-sync Edge Function uses service_role, which bypasses RLS.

-- ─── ithub_sync_log ─────────────────────────────────────────────────────────
-- Admin-only SELECT. INSERT is by service_role (via ithub-sync Edge Function).
alter table public.ithub_sync_log enable row level security;

create policy "ithub_sync_log_select_admin"
  on public.ithub_sync_log for select
  to authenticated
  using (public.current_role() = 'admin');
