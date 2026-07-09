-- ============================================================================
-- v0.3 Phase C: Opportunity tags (free-form, many-per-opportunity)
--
-- Schema-level approach: separate join table because opportunity_field_definitions
-- only supports single-value select. Tags are user-typed (no admin vocabulary).
--
-- RLS:
--   - SELECT: all authenticated (mirrors opportunities SELECT — anyone can see
--     tags on opportunities they can see)
--   - INSERT: presales + admin only (presales owns opportunity ownership)
--   - DELETE: presales + admin only (same matrix)
--   - No UPDATE — tags either exist or they don't. Re-insert with new value
--     if user wants to rename.
--
-- Cascade: tags are deleted automatically when the parent opportunity is deleted
-- (opportunities DELETE cascades via FK).
--
-- Conventions mirror 0001_init.sql / 0002_rls.sql / 0004_opportunity_custom_fields.sql:
--   * snake_case, uuid FKs, timestamptz for time columns
--   * RLS enabled + per-command policies, reusing public.current_role()
--   * Idempotent: create ... if not exists; drop policy if exists before create
-- ============================================================================

create table if not exists public.opportunity_tags (
  opportunity_id  uuid not null references public.opportunities(id) on delete cascade,
  tag             text not null check (length(tag) between 1 and 40),
  created_at      timestamptz not null default now(),
  primary key (opportunity_id, tag)
);

-- Read pattern: filter opportunities by a given tag (Phase C+ "filter by tag"
-- use case). The PK already covers lookups by (opportunity_id, tag) — this
-- index covers the inverse direction (tag → opportunities).
create index if not exists opportunity_tags_tag_idx
  on public.opportunity_tags(tag);

alter table public.opportunity_tags enable row level security;

-- ─── Policies (idempotent: drop-then-create, matches 0004 / 0005) ──────────

-- All authenticated users can read tags (mirrors opportunities_select_all).
drop policy if exists "opportunity_tags_select_all" on public.opportunity_tags;
create policy "opportunity_tags_select_all"
  on public.opportunity_tags for select
  to authenticated
  using (true);

-- presales + admin can insert tags. The FK to opportunities(id) ensures the
-- opportunity exists; no need to re-check in the policy.
drop policy if exists "opportunity_tags_insert_presales_admin" on public.opportunity_tags;
create policy "opportunity_tags_insert_presales_admin"
  on public.opportunity_tags for insert
  to authenticated
  with check (public.current_role() in ('presales', 'admin'));

-- presales + admin can delete tags. Same matrix as INSERT — there is no
-- separate UPDATE policy because tags are insert-or-delete only: a rename is
-- modeled as delete + insert at the API surface.
drop policy if exists "opportunity_tags_delete_presales_admin" on public.opportunity_tags;
create policy "opportunity_tags_delete_presales_admin"
  on public.opportunity_tags for delete
  to authenticated
  using (public.current_role() in ('presales', 'admin'));
