-- ============================================================================
-- v0.4 Phase D: Artifact definitions (admin-managed) + pre-handover uploads
--
-- Replaces the v0.3 hardcoded 5-artifact list with admin-managed
-- definitions. Per-opportunity artifacts can be uploaded BEFORE handover
-- (stored with opportunity_id, project_id NULL); on handover they get
-- reassigned to project_id.
-- ============================================================================

create table if not exists public.artifact_definitions (
  id              uuid primary key default gen_random_uuid(),
  type            text not null unique check (length(type) between 1 and 30),
  label           text not null check (length(label) between 1 and 80),
  description     text,
  is_required     boolean not null default false,
  display_order   integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists artifact_definitions_active_order_idx
  on public.artifact_definitions(is_active, display_order);

-- Seed the 5 default types that v0.3 hardcoded. Idempotent via ON CONFLICT.
insert into public.artifact_definitions (type, label, description, is_required, display_order) values
  ('HT-JL-01', '技术方案', '整体技术架构与方案设计', true, 1),
  ('HT-JL-02', '网络拓扑', '网络架构图与 IP 规划', true, 2),
  ('HT-JL-03-1', '实施计划', '项目实施进度计划', true, 3),
  ('SOW', '工作说明书', 'SOW 文档', false, 4),
  ('CONTRACT', '合同', '项目合同', false, 5)
on conflict (type) do nothing;

-- Modify artifacts: add opportunity_id (pre-handover uploads), make project_id
-- nullable, add FK to artifact_definitions.
alter table public.artifacts
  add column if not exists opportunity_id uuid references public.opportunities(id) on delete cascade,
  add column if not exists artifact_definition_id uuid references public.artifact_definitions(id);

-- The original CHECK on `type` constrains to the 5 hardcoded values. We
-- keep the CHECK so legacy data (if any) still validates, but new rows
-- with custom types are NOT allowed unless the admin first adds the type
-- to artifact_definitions AND removes the CHECK. For v0.4 MVP, we leave
-- the CHECK in place — admin only adds types from the existing 5.
-- (Future v0.4.1 could drop the CHECK to allow arbitrary types.)

-- project_id was originally NOT NULL. v0.4 needs it nullable for pre-handover
-- uploads. We do NOT alter the column type (PG won't allow NOT NULL → NULL
-- without a default, but it IS allowed since we're making it MORE permissive).
alter table public.artifacts
  alter column project_id drop not null;

create index if not exists artifacts_opportunity_id_idx
  on public.artifacts(opportunity_id);
create index if not exists artifacts_definition_id_idx
  on public.artifacts(artifact_definition_id);

-- Update RLS: presales + admin can now write artifacts for an opportunity_id
-- (pre-handover), and the existing policies cover project_id (post-handover).
-- We also extend INSERT to include delivery (so delivery engineers can upload).
drop policy if exists "artifacts_insert_presales_pm_admin" on public.artifacts;

create policy "artifacts_insert_presales_pm_delivery_admin"
  on public.artifacts for insert
  to authenticated
  with check (public.current_role() in ('presales','pm','delivery','admin'));

drop policy if exists "artifacts_update_presales_pm_admin" on public.artifacts;

create policy "artifacts_update_presales_pm_delivery_admin"
  on public.artifacts for update
  to authenticated
  using (public.current_role() in ('presales','pm','delivery','admin'))
  with check (public.current_role() in ('presales','pm','delivery','admin'));

drop policy if exists "artifacts_delete_presales_pm_admin" on public.artifacts;

create policy "artifacts_delete_presales_pm_delivery_admin"
  on public.artifacts for delete
  to authenticated
  using (public.current_role() in ('presales','pm','delivery','admin'));

-- Create the Supabase Storage bucket for artifact files. PRIVATE bucket
-- (public = false) — files are served via signed URLs from the frontend.
-- The insert into storage.buckets requires elevated privileges; this works
-- when run via the Supabase SQL Editor with the postgres role, or via
-- supabase db push. If the bucket already exists, the ON CONFLICT skips.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'artifacts',
  'artifacts',
  false,                              -- private bucket
  52428800,                          -- 50 MB per file
  array['application/pdf','image/png','image/jpeg','application/zip',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword','application/vnd.ms-excel','text/plain']
)
on conflict (id) do nothing;