-- ============================================================================
-- v0.4 Phase B: Opportunity tag definitions (admin-managed vocabulary)
--
-- Replaces the free-form v0.3 tags (migration 0007) with a managed
-- vocabulary. Admin maintains a global list of `opportunity_tag_definitions`;
-- per-opportunity `opportunity_tag_values` is a many-to-many join.
--
-- Migration strategy: drop the old `opportunity_tags` table (it had free-form
-- text and was unused beyond demo data); create the two new tables. This is
-- a v0.4 breaking change for the tags table — no production data depends on
-- it yet, so a clean swap is fine.
-- ============================================================================

drop table if exists public.opportunity_tags cascade;

create table if not exists public.opportunity_tag_definitions (
  id              uuid primary key default gen_random_uuid(),
  tag             text not null unique check (tag ~ '^[a-z0-9_-]{1,40}$'),
  label           text not null check (length(label) between 1 and 80),
  color           text not null default 'tag-info'
                    check (color in ('tag-info', 'tag-success', 'tag-warning',
                                     'tag-danger', 'tag-neutral')),
  display_order   integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists opportunity_tag_definitions_active_order_idx
  on public.opportunity_tag_definitions(is_active, display_order);

create table if not exists public.opportunity_tag_values (
  opportunity_id  uuid not null references public.opportunities(id) on delete cascade,
  tag_id          uuid not null references public.opportunity_tag_definitions(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (opportunity_id, tag_id)
);

create index if not exists opportunity_tag_values_tag_idx
  on public.opportunity_tag_values(tag_id);

alter table public.opportunity_tag_definitions enable row level security;
alter table public.opportunity_tag_values enable row level security;

-- All authenticated users can read active tag definitions (for the chip picker).
create policy "opportunity_tag_definitions_select_active"
  on public.opportunity_tag_definitions for select
  to authenticated
  using (is_active = true or public.current_role() = 'admin');

-- Only admin can write tag definitions.
create policy "opportunity_tag_definitions_admin_write"
  on public.opportunity_tag_definitions for all
  to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- All authenticated can read tag values (mirrors opportunities SELECT).
create policy "opportunity_tag_values_select"
  on public.opportunity_tag_values for select
  to authenticated
  using (true);

-- presales + admin can write/delete tag values.
create policy "opportunity_tag_values_insert_presales_admin"
  on public.opportunity_tag_values for insert
  to authenticated
  with check (public.current_role() in ('presales', 'admin'));

create policy "opportunity_tag_values_delete_presales_admin"
  on public.opportunity_tag_values for delete
  to authenticated
  using (public.current_role() in ('presales', 'admin'));