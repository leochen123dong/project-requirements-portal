/**
 * Shared contracts between frontend & backend.
 * Phase 0 stub — Phase 1 backend-dev will populate Zod schemas and TS types
 * matching the Postgres schema in `supabase/migrations/`.
 *
 * CONTRACT RULES:
 *  - Every entity has both a Zod schema (runtime validation) and an inferred TS type.
 *  - Field names MUST match Postgres column names (snake_case stays snake_case in TS).
 *  - Enums in TS MUST match Postgres enums exactly.
 */

import { z } from 'zod';

// ─── Enums ─────────────────────────────────────────────────────────────────

export const RoleEnum = z.enum(['presales', 'pm', 'delivery', 'postsales', 'admin']);
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
// TODO(Phase 1 backend-dev): replace stubs with real Zod schemas matching migrations.

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