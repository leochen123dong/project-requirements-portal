/**
 * Shared contracts between frontend & backend.
 * Phase 1: Zod schemas + TS types matching Postgres schema
 *   in `supabase/migrations/0001_init.sql` and RLS in `0002_rls.sql`.
 *
 * CONTRACT RULES:
 *  - Every entity has both a Zod schema (runtime validation) and an inferred TS type.
 *  - Field names MUST match Postgres column names (snake_case stays snake_case in TS).
 *  - Enums in TS MUST match Postgres CHECK constraints exactly (case-sensitive).
 */

import { z } from 'zod';

// ─── Enums ─────────────────────────────────────────────────────────────────

// ROLES tuple — kept as a const tuple for direct iteration in UI (e.g. role
// picker) and as a runtime value. The matching RoleEnum Zod schema below
// uses the same literal values as the CHECK constraint in profiles.role.
export const ROLES = ['presales', 'pm', 'delivery', 'postsales', 'admin'] as const;

export const RoleEnum = z.enum(ROLES);
export type Role = z.infer<typeof RoleEnum>;

export const OpportunityStageEnum = z.enum([
  'lead',          // 线索
  'qualified',     // 已验证
  'proposal',      // 方案中
  'negotiation',   // 谈判中
  'won',           // 成交
  'lost',          // 丢单
]);
export type OpportunityStage = z.infer<typeof OpportunityStageEnum>;

export const ProjectStatusEnum = z.enum([
  'initiated',     // 已立项
  'in_progress',   // 交付中
  'accepted',      // 已验收
  'closed',        // 已关闭
]);
export type ProjectStatus = z.infer<typeof ProjectStatusEnum>;

export const MilestoneStatusEnum = z.enum(['pending', 'in_progress', 'done', 'blocked']);
export type MilestoneStatus = z.infer<typeof MilestoneStatusEnum>;

export const ArtifactTypeEnum = z.enum(['HT-JL-01', 'HT-JL-02', 'HT-JL-03-1', 'SOW', 'CONTRACT']);
export type ArtifactType = z.infer<typeof ArtifactTypeEnum>;

export const CommentTargetTypeEnum = z.enum(['opportunity', 'project', 'milestone', 'task']);
export type CommentTargetType = z.infer<typeof CommentTargetTypeEnum>;

// ─── Entities ──────────────────────────────────────────────────────────────
// All field types match the Postgres columns in 0001_init.sql exactly.

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string(),
  role: RoleEnum,
  created_at: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const OpportunitySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  customer: z.string(),
  amount: z.number().nullable(),
  stage: OpportunityStageEnum,
  owner_id: z.string().uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  opportunity_id: z.string().uuid(),
  name: z.string(),
  pm_id: z.string().uuid(),
  status: ProjectStatusEnum,
  ithub_ticket_id: z.string().nullable(),
  created_at: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const MilestoneSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  name: z.string(),
  phase: z.string(),
  due_date: z.string(),
  status: MilestoneStatusEnum,
  order: z.number().int(),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  milestone_id: z.string().uuid(),
  assignee_id: z.string().uuid(),
  title: z.string(),
  done: z.boolean(),
  due_date: z.string().nullable(),
});
export type Task = z.infer<typeof TaskSchema>;

export const CommentSchema = z.object({
  id: z.string().uuid(),
  target_type: CommentTargetTypeEnum,
  target_id: z.string().uuid(),
  author_id: z.string().uuid(),
  body: z.string(),
  created_at: z.string(),
});
export type Comment = z.infer<typeof CommentSchema>;

export const ArtifactSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  type: ArtifactTypeEnum,
  storage_path: z.string(),
  uploaded_by: z.string().uuid(),
  created_at: z.string(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const ITHubTicketSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  ithub_id: z.string(),
  subject: z.string(),
  status: z.string(),
  sla_breach_at: z.string().nullable(),
  last_synced_at: z.string(),
});
export type ITHubTicket = z.infer<typeof ITHubTicketSchema>;

// Audit log — used by AdminDashboardPage "Recent activity" stream.
export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  actor_id: z.string().uuid().nullable(),
  action: z.enum(['insert', 'update', 'delete']),
  entity: z.string(),
  entity_id: z.string().uuid().nullable(),
  at: z.string(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

// ITHub sync log — used by AdminDashboardPage "Last sync time" widget.
export const ITHubSyncLogSchema = z.object({
  id: z.string().uuid(),
  ran_at: z.string(),
  tickets_pulled: z.number().int(),
  errors: z.string().nullable(),
});
export type ITHubSyncLog = z.infer<typeof ITHubSyncLogSchema>;

// ─── Request / Response helpers ────────────────────────────────────────────

export const ListOpportunitiesQuery = z.object({
  owner_id: z.string().uuid().optional(),
  stage: OpportunityStageEnum.optional(),
});

export const HandoverRequest = z.object({
  opportunity_id: z.string().uuid(),
  pm_id: z.string().uuid(),
  artifacts: z.array(ArtifactTypeEnum).min(5), // 5 必备交付物
});
export type HandoverRequest = z.infer<typeof HandoverRequest>;

// ─── Admin: Edge Function action contract ────────────────────────────────────
// Sent to supabase.functions.invoke('admin-users', { body: ... }).
// The action discriminates; subsequent fields vary by action.

export const AdminUserActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({
    action: z.literal('invite'),
    email: z.string().email(),
    role: RoleEnum,
    display_name: z.string().min(1).max(80),
    password: z.string().min(6).optional(), // if absent, send magic link
  }),
  z.object({
    action: z.literal('update-role'),
    user_id: z.string().uuid(),
    role: RoleEnum,
    display_name: z.string().min(1).max(80).optional(),
  }),
  z.object({
    action: z.literal('set-password'),
    user_id: z.string().uuid(),
    password: z.string().min(6),
  }),
  z.object({
    action: z.literal('delete'),
    user_id: z.string().uuid(),
  }),
]);
export type AdminUserAction = z.infer<typeof AdminUserActionSchema>;

export const AdminUserRecordSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  display_name: z.string(),
  role: RoleEnum,
  created_at: z.string(),
});
export type AdminUserRecord = z.infer<typeof AdminUserRecordSchema>;

// ─── Custom fields (opportunity_field_definitions + values) ────────────────

export const FieldTypeEnum = z.enum(['text', 'number', 'date', 'select']);
export type FieldType = z.infer<typeof FieldTypeEnum>;

export const FieldDefinitionSchema = z.object({
  id: z.string().uuid(),
  // machine name — snake_case. Regex matches the SQL CHECK on
  // opportunity_field_definitions.name char-for-char: ^[a-z][a-z0-9_]*$
  name: z.string().max(40).regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1).max(80), // human label
  type: FieldTypeEnum,
  options: z.array(z.string()).nullable(), // JSONB → array of strings; required when type='select'
  required: z.boolean(),
  display_order: z.number().int(),
  is_active: z.boolean(),
  created_at: z.string().optional(),
});
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;

export const FieldValueSchema = z.object({
  opportunity_id: z.string().uuid(),
  field_id: z.string().uuid(),
  value: z.string().nullable(), // everything stored as text; UI casts by type
});
export type FieldValue = z.infer<typeof FieldValueSchema>;

// ─── Chart data shapes (used by DonutChart / BarChart components) ───────────

export const ChartDatumSchema = z.object({
  label: z.string(),
  value: z.number(),
});
export type ChartDatum = z.infer<typeof ChartDatumSchema>;
