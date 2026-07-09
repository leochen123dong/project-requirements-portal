-- ============================================================================
-- Phase B (v0.2): Opportunity custom fields — SCHEMA-LEVEL
--
-- Adds admin-defined custom fields that apply to *all* opportunities, using
-- two tables instead of a per-opportunity jsonb blob (so values stay queryable
-- with plain SQL and joinable to the opportunities table).
--
-- Design decisions (non-obvious — read before editing):
--   * SCHEMA-LEVEL, not per-opportunity: an admin defines the field list ONCE
--     in `opportunity_field_definitions`; every opportunity can carry a value
--     for each active definition (stored in `opportunity_field_values`). This
--     keeps the model simple + predictable (see plan Phase B), and avoids a
--     free-form metadata column on `opportunities`.
--   * type = 'select' REQUIRES `options`: `options` is a JSON array of strings
--     (e.g. ["金融","制造"]) stored as jsonb. For other types it is NULL. The
--     app layer enforces the "select ⇒ options non-empty" rule at write time
--     (kept out of a CHECK constraint to keep the migration simple + because
--     jsonb array validation in a CHECK is awkward).
--   * value stored as TEXT (single column), cast per-type at the UI layer:
--     this is intentional. A single `value text` column avoids one nullable
--     column per type (value_text / value_number / value_date ...). The
--     definition's `type` tells the UI how to parse/format the string.
--
-- Conventions mirror 0001_init.sql / 0002_rls.sql / 0003_triggers.sql:
--   * snake_case, uuid PKs via gen_random_uuid(), timestamptz for time columns
--   * CHECK constraints mirror FieldTypeEnum in web/src/types/contracts.ts
--   * RLS enabled + per-command policies, reusing public.current_role()
--   * Idempotent: create ... if not exists; drop policy if exists before create
--
-- Apply via `supabase db push` or paste into the Supabase SQL Editor.
-- ============================================================================

-- ─── opportunity_field_definitions ──────────────────────────────────────────
-- Admin-managed catalog of custom fields. `name` is a snake_case machine name
-- (unique, used as a stable key); `label` is the human-facing display name.
create table if not exists public.opportunity_field_definitions (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique check (name ~ '^[a-z][a-z0-9_]*$'),  -- snake_case machine name
  label           text not null check (length(label) between 1 and 80),
  type            text not null check (type in ('text','number','date','select')),
  options         jsonb,  -- text[] as JSON; required (app-enforced) when type='select'
  required        boolean not null default false,
  display_order   integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Read pattern: the admin field-management page + opportunity forms filter by
-- is_active and sort by display_order.
create index if not exists opportunity_field_definitions_active_order_idx
  on public.opportunity_field_definitions(is_active, display_order);

-- ─── opportunity_field_values ───────────────────────────────────────────────
-- One row per (opportunity, field) pair. Everything stored as text; the UI
-- casts based on the definition's `type`. Cascades on delete of either the
-- opportunity or the field definition.
create table if not exists public.opportunity_field_values (
  opportunity_id  uuid not null references public.opportunities(id) on delete cascade,
  field_id        uuid not null references public.opportunity_field_definitions(id) on delete cascade,
  value           text,  -- everything stored as text; UI layer casts per type
  primary key (opportunity_id, field_id)
);

-- Read pattern: "how many values reference this field?" (delete guard) + joins
-- from the values table back to a definition. The PK already covers lookups by
-- opportunity_id (leading column), so we only add the field_id index.
create index if not exists opportunity_field_values_field_idx
  on public.opportunity_field_values(field_id);

-- ─── RLS: opportunity_field_definitions ─────────────────────────────────────
alter table public.opportunity_field_definitions enable row level security;

-- All authenticated users can SELECT active definitions; admin can also see
-- inactive ones (for the management page).
drop policy if exists "opportunity_field_definitions_select_active"
  on public.opportunity_field_definitions;
create policy "opportunity_field_definitions_select_active"
  on public.opportunity_field_definitions for select
  to authenticated
  using (is_active = true or public.current_role() = 'admin');

-- Admin can CRUD (INSERT/UPDATE/DELETE) definitions.
drop policy if exists "opportunity_field_definitions_admin_write"
  on public.opportunity_field_definitions;
create policy "opportunity_field_definitions_admin_write"
  on public.opportunity_field_definitions for all
  to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ─── RLS: opportunity_field_values ──────────────────────────────────────────
alter table public.opportunity_field_values enable row level security;

-- All authenticated users can read values (MVP: matches the all-authenticated
-- read model on public.opportunities in 0002_rls.sql).
drop policy if exists "opportunity_field_values_select"
  on public.opportunity_field_values;
create policy "opportunity_field_values_select"
  on public.opportunity_field_values for select
  to authenticated
  using (true);

-- presales + admin can write values (mirrors who can write opportunities).
drop policy if exists "opportunity_field_values_presales_admin_write"
  on public.opportunity_field_values;
create policy "opportunity_field_values_presales_admin_write"
  on public.opportunity_field_values for all
  to authenticated
  using (public.current_role() in ('presales','admin'))
  with check (public.current_role() in ('presales','admin'));
