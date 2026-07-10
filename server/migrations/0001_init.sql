-- v1.0 SQLite schema: translated from supabase/migrations/0001-0011.sql
-- No RLS, no Postgres triggers — permissions enforced at app layer (requireRole middleware)
-- All UUIDs generated via `lower(hex(randomblob(16)))` (SQLite equivalent of gen_random_uuid)

-- ─── profiles ─────────────────────────────────────────────────────────────
create table if not exists profiles (
  id            text primary key default (lower(hex(randomblob(16)))),
  email         text not null unique,
  password_hash text not null,
  display_name  text not null,
  role          text not null check (role in ('presales','pm','delivery','postsales','admin')),
  created_at    text not null default (datetime('now'))
);

-- ─── opportunities ───────────────────────────────────────────────────────
create table if not exists opportunities (
  id           text primary key default (lower(hex(randomblob(16)))),
  name         text not null,
  customer     text not null,
  amount       real,
  stage        text not null default 'lead' check (stage in ('lead','qualified','proposal','negotiation','won','lost')),
  owner_id     text not null references profiles(id) on delete restrict,
  presales_id  text references profiles(id) on delete set null,
  delivery_id  text references profiles(id) on delete set null,
  created_at   text not null default (datetime('now')),
  updated_at   text not null default (datetime('now'))
);
create index if not exists opportunities_presales_id_idx on opportunities(presales_id);
create index if not exists opportunities_delivery_id_idx on opportunities(delivery_id);
create index if not exists opportunities_owner_id_idx on opportunities(owner_id);
create index if not exists opportunities_stage_idx on opportunities(stage);

-- ─── projects ────────────────────────────────────────────────────────────
create table if not exists projects (
  id                 text primary key default (lower(hex(randomblob(16)))),
  opportunity_id     text not null references opportunities(id) on delete cascade,
  name               text not null,
  pm_id              text not null references profiles(id) on delete restrict,
  delivery_id        text references profiles(id) on delete set null,
  status             text not null default 'initiated' check (status in ('initiated','in_progress','accepted','closed')),
  required_artifacts text not null default '[]',  -- JSON array of artifact definition IDs
  ithub_ticket_id    text,
  created_at         text not null default (datetime('now'))
);
create index if not exists projects_opportunity_id_idx on projects(opportunity_id);
create index if not exists projects_pm_id_idx on projects(pm_id);
create index if not exists projects_delivery_id_idx on projects(delivery_id);
create index if not exists projects_status_idx on projects(status);

-- ─── milestones ──────────────────────────────────────────────────────────
create table if not exists milestones (
  id          text primary key default (lower(hex(randomblob(16)))),
  project_id  text not null references projects(id) on delete cascade,
  name        text not null,
  phase       text not null,
  due_date    text not null,
  status      text not null default 'pending' check (status in ('pending','in_progress','done','blocked')),
  "order"     integer not null default 0,
  created_at  text not null default (datetime('now'))
);
create index if not exists milestones_project_id_order_idx on milestones(project_id, "order");

-- ─── tasks ────────────────────────────────────────────────────────────────
create table if not exists tasks (
  id           text primary key default (lower(hex(randomblob(16)))),
  milestone_id text not null references milestones(id) on delete cascade,
  assignee_id  text not null references profiles(id) on delete restrict,
  title        text not null,
  done         integer not null default 0 check (done in (0, 1)),
  due_date     text,
  created_at   text not null default (datetime('now'))
);
create index if not exists tasks_milestone_id_idx on tasks(milestone_id);
create index if not exists tasks_assignee_id_done_idx on tasks(assignee_id, done);

-- ─── comments (polymorphic) ──────────────────────────────────────────────
create table if not exists comments (
  id          text primary key default (lower(hex(randomblob(16)))),
  target_type text not null check (target_type in ('opportunity','project','milestone','task')),
  target_id   text not null,
  author_id   text not null references profiles(id) on delete cascade,
  body        text not null,
  created_at  text not null default (datetime('now'))
);
create index if not exists comments_target_idx on comments(target_type, target_id);

-- ─── opportunity_tag_definitions (admin-managed) ──────────────────────
create table if not exists opportunity_tag_definitions (
  id            text primary key default (lower(hex(randomblob(16)))),
  tag           text not null unique check (length(tag) between 1 and 40),
  label         text not null check (length(label) between 1 and 80),
  color         text not null default 'tag-info'
                  check (color in ('tag-info','tag-success','tag-warning','tag-danger','tag-neutral')),
  display_order integer not null default 0,
  is_active     integer not null default 1 check (is_active in (0, 1)),
  created_at    text not null default (datetime('now'))
);
create index if not exists opportunity_tag_definitions_active_order_idx
  on opportunity_tag_definitions(is_active, display_order);

create table if not exists opportunity_tag_values (
  opportunity_id text not null references opportunities(id) on delete cascade,
  tag_id         text not null references opportunity_tag_definitions(id) on delete cascade,
  created_at     text not null default (datetime('now')),
  primary key (opportunity_id, tag_id)
);
create index if not exists opportunity_tag_values_tag_idx on opportunity_tag_values(tag_id);

-- ─── opportunity_field_definitions (admin-managed) ──────────────────
create table if not exists opportunity_field_definitions (
  id            text primary key default (lower(hex(randomblob(16)))),
  field         text not null unique check (length(field) between 1 and 40),
  label         text not null check (length(label) between 1 and 80),
  type          text not null check (type in ('text','number','date','select')),
  options       text,  -- JSON array of strings (for select type)
  is_required   integer not null default 0 check (is_required in (0, 1)),
  display_order integer not null default 0,
  is_active     integer not null default 1 check (is_active in (0, 1)),
  created_at    text not null default (datetime('now'))
);
create index if not exists opportunity_field_definitions_active_order_idx
  on opportunity_field_definitions(is_active, display_order);

create table if not exists opportunity_field_values (
  opportunity_id text not null references opportunities(id) on delete cascade,
  field_id       text not null references opportunity_field_definitions(id) on delete cascade,
  value          text,
  primary key (opportunity_id, field_id)
);

-- ─── artifact_definitions (admin-managed) ──────────────────────────
create table if not exists artifact_definitions (
  id            text primary key default (lower(hex(randomblob(16)))),
  type          text not null unique check (length(type) between 1 and 30),
  label         text not null check (length(label) between 1 and 80),
  description   text,
  is_required   integer not null default 0 check (is_required in (0, 1)),
  display_order integer not null default 0,
  is_active     integer not null default 1 check (is_active in (0, 1)),
  created_at    text not null default (datetime('now'))
);
create index if not exists artifact_definitions_active_order_idx
  on artifact_definitions(is_active, display_order);

create table if not exists artifacts (
  id                     text primary key default (lower(hex(randomblob(16)))),
  artifact_definition_id text references artifact_definitions(id) on delete set null,
  type                   text not null,
  project_id             text references projects(id) on delete cascade,
  opportunity_id         text references opportunities(id) on delete cascade,
  storage_path           text not null,
  uploaded_by            text not null references profiles(id) on delete restrict,
  created_at             text not null default (datetime('now'))
);
create index if not exists artifacts_project_id_idx on artifacts(project_id);
create index if not exists artifacts_opportunity_id_idx on artifacts(opportunity_id);
create index if not exists artifacts_definition_id_idx on artifacts(artifact_definition_id);

-- ─── audit_log (immutable) ─────────────────────────────────────────────
create table if not exists audit_log (
  id        text primary key default (lower(hex(randomblob(16)))),
  actor_id  text references profiles(id) on delete set null,
  action    text not null check (action in ('insert','update','delete')),
  entity    text not null,
  entity_id text,
  payload   text,  -- JSON: { old: {...}, new: {...} } or full NEW row
  at        text not null default (datetime('now'))
);
create index if not exists audit_log_entity_idx on audit_log(entity, entity_id);
create index if not exists audit_log_at_idx on audit_log(at desc);

-- ─── ithub_tickets + sync_log (kept for future use) ────────────────
create table if not exists ithub_tickets (
  id             text primary key default (lower(hex(randomblob(16)))),
  project_id     text not null references projects(id) on delete cascade,
  ithub_id       text not null unique,
  subject        text not null,
  status         text not null,
  sla_breach_at  text,
  last_synced_at text not null default (datetime('now'))
);
create index if not exists ithub_tickets_project_id_idx on ithub_tickets(project_id);
create index if not exists ithub_tickets_sla_idx on ithub_tickets(sla_breach_at);

create table if not exists ithub_sync_log (
  id            text primary key default (lower(hex(randomblob(16)))),
  ran_at        text not null default (datetime('now')),
  tickets_pulled integer not null default 0,
  errors        text
);
