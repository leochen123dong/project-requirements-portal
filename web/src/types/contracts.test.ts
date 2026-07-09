import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  ProfileSchema,
  OpportunitySchema,
  ProjectSchema,
  MilestoneSchema,
  TaskSchema,
  CommentSchema,
  ArtifactSchema,
  ITHubTicketSchema,
  AuditLogSchema,
  ITHubSyncLogSchema,
  HandoverRequest,
  AdminUserActionSchema,
  AdminUserRecordSchema,
  FieldDefinitionSchema,
  FieldValueSchema,
  ChartDatumSchema,
  OpportunityTagSchema,
} from './contracts';

const UUID = '11111111-1111-1111-1111-111111111111';
const NOW = '2026-07-09T00:00:00.000Z';
const NOW2 = '2026-07-09T01:00:00.000Z';

const validProfile = {
  id: UUID,
  display_name: '王售前',
  role: 'presales',
  created_at: NOW,
};
const validOpportunity = {
  id: UUID,
  name: '某制造业园区网络安全升级',
  customer: '某科技公司',
  amount: 850000,
  stage: 'proposal',
  owner_id: UUID,
  created_at: NOW,
  updated_at: NOW2,
};
const validProject = {
  id: UUID,
  opportunity_id: UUID,
  name: '项目A',
  pm_id: UUID,
  status: 'in_progress',
  ithub_ticket_id: 'T-1001',
  created_at: NOW,
};
const validMilestone = {
  id: UUID,
  project_id: UUID,
  name: '项目启动会',
  phase: 'kickoff',
  due_date: '2026-07-15',
  status: 'pending',
  order: 1,
};
const validTask = {
  id: UUID,
  milestone_id: UUID,
  assignee_id: UUID,
  title: '准备启动会议程',
  done: false,
  due_date: '2026-07-14',
};
const validComment = {
  id: UUID,
  target_type: 'project',
  target_id: UUID,
  author_id: UUID,
  body: '请提前把会议纪要发出来',
  created_at: NOW,
};
const validArtifact = {
  id: UUID,
  project_id: UUID,
  type: 'HT-JL-01',
  storage_path: 'projects/x/ht-jl-01.pdf',
  uploaded_by: UUID,
  created_at: NOW,
};
const validTicket = {
  id: UUID,
  project_id: UUID,
  ithub_id: 'T-1001',
  subject: '核心交换机故障',
  status: 'open',
  sla_breach_at: NOW2,
  last_synced_at: NOW,
};
const validAudit = {
  id: UUID,
  actor_id: UUID,
  action: 'insert',
  entity: 'opportunities',
  entity_id: UUID,
  at: NOW,
};
const validSyncLog = {
  id: UUID,
  ran_at: NOW,
  tickets_pulled: 3,
  errors: null,
};

describe('ProfileSchema', () => {
  it('accepts a valid Profile', () => {
    expect(() => ProfileSchema.parse(validProfile)).not.toThrow();
  });

  it('rejects an unknown role', () => {
    expect(() => ProfileSchema.parse({ ...validProfile, role: 'superadmin' })).toThrow(z.ZodError);
  });

  it('rejects non-UUID id', () => {
    expect(() => ProfileSchema.parse({ ...validProfile, id: 'not-a-uuid' })).toThrow(z.ZodError);
  });
});

describe('OpportunitySchema', () => {
  it('accepts a valid Opportunity', () => {
    expect(() => OpportunitySchema.parse(validOpportunity)).not.toThrow();
  });

  it('rejects an unknown stage', () => {
    expect(() => OpportunitySchema.parse({ ...validOpportunity, stage: 'cold' })).toThrow(z.ZodError);
  });

  it('accepts null amount (nullable)', () => {
    expect(() => OpportunitySchema.parse({ ...validOpportunity, amount: null })).not.toThrow();
  });
});

describe('ProjectSchema', () => {
  it('accepts a valid Project', () => {
    expect(() => ProjectSchema.parse(validProject)).not.toThrow();
  });

  it('rejects an unknown status', () => {
    expect(() => ProjectSchema.parse({ ...validProject, status: 'archived' })).toThrow(z.ZodError);
  });

  it('accepts null ithub_ticket_id', () => {
    expect(() => ProjectSchema.parse({ ...validProject, ithub_ticket_id: null })).not.toThrow();
  });
});

describe('MilestoneSchema', () => {
  it('accepts a valid Milestone', () => {
    expect(() => MilestoneSchema.parse(validMilestone)).not.toThrow();
  });

  it('rejects unknown status', () => {
    expect(() => MilestoneSchema.parse({ ...validMilestone, status: 'skipped' })).toThrow(z.ZodError);
  });

  it('requires integer order', () => {
    expect(() => MilestoneSchema.parse({ ...validMilestone, order: 1.5 })).toThrow(z.ZodError);
  });
});

describe('TaskSchema', () => {
  it('accepts a valid Task', () => {
    expect(() => TaskSchema.parse(validTask)).not.toThrow();
  });

  it('accepts null due_date (nullable)', () => {
    expect(() => TaskSchema.parse({ ...validTask, due_date: null })).not.toThrow();
  });
});

describe('CommentSchema', () => {
  it('accepts a valid Comment', () => {
    expect(() => CommentSchema.parse(validComment)).not.toThrow();
  });

  it('rejects unknown target_type', () => {
    expect(() => CommentSchema.parse({ ...validComment, target_type: 'user' })).toThrow(z.ZodError);
  });
});

describe('ArtifactSchema', () => {
  it('accepts a valid Artifact', () => {
    expect(() => ArtifactSchema.parse(validArtifact)).not.toThrow();
  });

  it('rejects unknown artifact type', () => {
    expect(() => ArtifactSchema.parse({ ...validArtifact, type: 'PPT' })).toThrow(z.ZodError);
  });

  it('accepts all 5 known artifact types', () => {
    for (const t of ['HT-JL-01', 'HT-JL-02', 'HT-JL-03-1', 'SOW', 'CONTRACT']) {
      expect(() => ArtifactSchema.parse({ ...validArtifact, type: t })).not.toThrow();
    }
  });
});

describe('ITHubTicketSchema', () => {
  it('accepts a valid ticket', () => {
    expect(() => ITHubTicketSchema.parse(validTicket)).not.toThrow();
  });

  it('accepts null sla_breach_at (closed tickets)', () => {
    expect(() =>
      ITHubTicketSchema.parse({ ...validTicket, sla_breach_at: null }),
    ).not.toThrow();
  });

  it('accepts arbitrary status strings (ITHub is open-vocab)', () => {
    expect(() => ITHubTicketSchema.parse({ ...validTicket, status: 'escalated' })).not.toThrow();
  });
});

describe('AuditLogSchema', () => {
  it('accepts a valid AuditLog', () => {
    expect(() => AuditLogSchema.parse(validAudit)).not.toThrow();
  });

  it('rejects unknown action', () => {
    expect(() => AuditLogSchema.parse({ ...validAudit, action: 'execute' })).toThrow(z.ZodError);
  });

  it('accepts nullable actor_id (system-triggered rows)', () => {
    expect(() => AuditLogSchema.parse({ ...validAudit, actor_id: null })).not.toThrow();
  });
});

describe('ITHubSyncLogSchema', () => {
  it('accepts a valid log row', () => {
    expect(() => ITHubSyncLogSchema.parse(validSyncLog)).not.toThrow();
  });

  it('rejects non-integer tickets_pulled', () => {
    expect(() =>
      ITHubSyncLogSchema.parse({ ...validSyncLog, tickets_pulled: 3.5 }),
    ).toThrow(z.ZodError);
  });

  it('accepts non-null errors string', () => {
    expect(() =>
      ITHubSyncLogSchema.parse({ ...validSyncLog, errors: 'auth failed' }),
    ).not.toThrow();
  });
});

describe('HandoverRequest (request payload)', () => {
  it('requires exactly 5 distinct artifacts', () => {
    const req = { opportunity_id: UUID, pm_id: UUID, artifacts: ['HT-JL-01', 'HT-JL-02', 'HT-JL-03-1', 'SOW', 'CONTRACT'] };
    expect(() => HandoverRequest.parse(req)).not.toThrow();
  });

  it('rejects fewer than 5 artifacts', () => {
    const req = { opportunity_id: UUID, pm_id: UUID, artifacts: ['HT-JL-01', 'HT-JL-02', 'HT-JL-03-1', 'SOW'] };
    expect(() => HandoverRequest.parse(req)).toThrow(z.ZodError);
  });

  it('rejects unknown artifact types in payload', () => {
    const req = { opportunity_id: UUID, pm_id: UUID, artifacts: ['HT-JL-01', 'HT-JL-02', 'HT-JL-03-1', 'SOW', 'PPT'] };
    expect(() => HandoverRequest.parse(req)).toThrow(z.ZodError);
  });
});

/**
 * Cross-cutting: every schema accepts the full set of expected fixture
 * objects we just defined. Catches a future field rename that forgot
 * to update a sample fixture.
 */
describe('all schemas — round-trip sanity', () => {
  const cases: Array<[string, z.ZodTypeAny, unknown]> = [
    ['ProfileSchema', ProfileSchema, validProfile],
    ['OpportunitySchema', OpportunitySchema, validOpportunity],
    ['ProjectSchema', ProjectSchema, validProject],
    ['MilestoneSchema', MilestoneSchema, validMilestone],
    ['TaskSchema', TaskSchema, validTask],
    ['CommentSchema', CommentSchema, validComment],
    ['ArtifactSchema', ArtifactSchema, validArtifact],
    ['ITHubTicketSchema', ITHubTicketSchema, validTicket],
    ['AuditLogSchema', AuditLogSchema, validAudit],
    ['ITHubSyncLogSchema', ITHubSyncLogSchema, validSyncLog],
  ];

  for (const [name, schema, sample] of cases) {
    it(`${name} parses its sample`, () => {
      expect(() => schema.parse(sample)).not.toThrow();
    });
  }
});

// ─── v0.2 — Admin user action contract (Phase A) ───────────────────────────
// Discriminated union sent to the `admin-users` Edge Function. Every action
// variant has a different payload — the discriminator is `action`.

const VALID_ADMIN_USER_RECORD = {
  id: UUID,
  email: 'admin@demo.local',
  display_name: '管理员',
  role: 'admin' as const,
  created_at: NOW,
};

describe('AdminUserActionSchema — list action', () => {
  it('accepts { action: "list" } with no extra fields', () => {
    expect(() => AdminUserActionSchema.parse({ action: 'list' })).not.toThrow();
  });

  it('parses the variant type correctly', () => {
    const parsed = AdminUserActionSchema.parse({ action: 'list' });
    expect(parsed.action).toBe('list');
  });
});

describe('AdminUserActionSchema — invite action', () => {
  it('accepts a full invite payload', () => {
    const payload = {
      action: 'invite' as const,
      email: 'newuser@demo.local',
      role: 'pm' as const,
      display_name: '新用户',
    };
    expect(() => AdminUserActionSchema.parse(payload)).not.toThrow();
  });

  it('accepts invite with optional password', () => {
    const payload = {
      action: 'invite' as const,
      email: 'newuser@demo.local',
      role: 'pm' as const,
      display_name: '新用户',
      password: 'plaintext-pass',
    };
    expect(() => AdminUserActionSchema.parse(payload)).not.toThrow();
  });

  it('rejects an invalid email', () => {
    const payload = {
      action: 'invite',
      email: 'not-an-email',
      role: 'pm',
      display_name: 'X',
    };
    expect(() => AdminUserActionSchema.parse(payload)).toThrow(z.ZodError);
  });

  it('rejects a too-short display_name', () => {
    const payload = {
      action: 'invite',
      email: 'a@b.co',
      role: 'pm',
      display_name: '',
    };
    expect(() => AdminUserActionSchema.parse(payload)).toThrow(z.ZodError);
  });

  it('rejects unknown role', () => {
    const payload = {
      action: 'invite',
      email: 'a@b.co',
      role: 'superuser',
      display_name: 'X',
    };
    expect(() => AdminUserActionSchema.parse(payload)).toThrow(z.ZodError);
  });
});

describe('AdminUserActionSchema — update-role action', () => {
  it('accepts a minimal update-role payload', () => {
    const payload = {
      action: 'update-role' as const,
      user_id: UUID,
      role: 'delivery' as const,
    };
    expect(() => AdminUserActionSchema.parse(payload)).not.toThrow();
  });

  it('accepts update-role with optional display_name', () => {
    const payload = {
      action: 'update-role' as const,
      user_id: UUID,
      role: 'postsales' as const,
      display_name: '新名字',
    };
    expect(() => AdminUserActionSchema.parse(payload)).not.toThrow();
  });

  it('rejects non-UUID user_id', () => {
    const payload = {
      action: 'update-role',
      user_id: 'nope',
      role: 'pm',
    };
    expect(() => AdminUserActionSchema.parse(payload)).toThrow(z.ZodError);
  });
});

describe('AdminUserActionSchema — set-password action', () => {
  it('accepts a valid set-password payload', () => {
    const payload = {
      action: 'set-password' as const,
      user_id: UUID,
      password: 'longerthan6',
    };
    expect(() => AdminUserActionSchema.parse(payload)).not.toThrow();
  });

  it('rejects passwords shorter than 6 chars', () => {
    const payload = {
      action: 'set-password',
      user_id: UUID,
      password: '123',
    };
    expect(() => AdminUserActionSchema.parse(payload)).toThrow(z.ZodError);
  });
});

describe('AdminUserActionSchema — delete action', () => {
  it('accepts { action: "delete", user_id }', () => {
    const payload = { action: 'delete' as const, user_id: UUID };
    expect(() => AdminUserActionSchema.parse(payload)).not.toThrow();
  });
});

describe('AdminUserActionSchema — unknown / malformed actions', () => {
  it('rejects an unknown action string', () => {
    expect(() =>
      AdminUserActionSchema.parse({ action: 'ban-hammer', user_id: UUID }),
    ).toThrow(z.ZodError);
  });

  it('rejects a missing action field entirely', () => {
    expect(() =>
      AdminUserActionSchema.parse({ email: 'a@b.co', role: 'pm', display_name: 'X' }),
    ).toThrow(z.ZodError);
  });
});

describe('AdminUserRecordSchema', () => {
  it('accepts a fully-populated record', () => {
    expect(() => AdminUserRecordSchema.parse(VALID_ADMIN_USER_RECORD)).not.toThrow();
  });

  it('documents that email is validated upstream (not enforced by Zod)', () => {
    // AdminUserRecordSchema types `email: z.string()` — the Edge Function
    // is the source of truth for email validation (it talks to Supabase auth).
    // This test pins that behavior so a future "tighten" PR is deliberate.
    expect(() =>
      AdminUserRecordSchema.parse({ ...VALID_ADMIN_USER_RECORD, email: 'not an email' }),
    ).not.toThrow();
  });

  it('rejects a non-UUID id', () => {
    expect(() =>
      AdminUserRecordSchema.parse({ ...VALID_ADMIN_USER_RECORD, id: 'xx' }),
    ).toThrow(z.ZodError);
  });

  it('rejects an unknown role', () => {
    expect(() =>
      AdminUserRecordSchema.parse({ ...VALID_ADMIN_USER_RECORD, role: 'superadmin' }),
    ).toThrow(z.ZodError);
  });
});

// ─── v0.2 — Custom field schemas (Phase B) ─────────────────────────────────
// The `name` regex is critical: it MUST match the SQL CHECK constraint
// `^[a-z][a-z0-9_]*$` byte-for-byte. If it diverges, the SQL insert will
// pass but Zod will reject on read-back, causing phantom validation bugs.

const VALID_FIELD_DEFINITION = {
  id: UUID,
  name: 'industry',
  label: '行业',
  type: 'text' as const,
  options: null,
  required: true,
  display_order: 0,
  is_active: true,
  created_at: NOW,
};

describe('FieldDefinitionSchema — snake_case name regex', () => {
  it('accepts a fully populated definition', () => {
    expect(() => FieldDefinitionSchema.parse(VALID_FIELD_DEFINITION)).not.toThrow();
  });

  it('accepts lowercase + digits + underscores', () => {
    expect(() =>
      FieldDefinitionSchema.parse({ ...VALID_FIELD_DEFINITION, name: 'expected_close_date_v2' }),
    ).not.toThrow();
  });

  it('rejects uppercase letter in name', () => {
    expect(() =>
      FieldDefinitionSchema.parse({ ...VALID_FIELD_DEFINITION, name: 'Industry' }),
    ).toThrow(z.ZodError);
  });

  it('rejects hyphen in name', () => {
    expect(() =>
      FieldDefinitionSchema.parse({ ...VALID_FIELD_DEFINITION, name: 'expected-date' }),
    ).toThrow(z.ZodError);
  });

  it('rejects digit-start name (must begin with [a-z])', () => {
    expect(() =>
      FieldDefinitionSchema.parse({ ...VALID_FIELD_DEFINITION, name: '1st_followup' }),
    ).toThrow(z.ZodError);
  });

  it('rejects empty name', () => {
    expect(() =>
      FieldDefinitionSchema.parse({ ...VALID_FIELD_DEFINITION, name: '' }),
    ).toThrow(z.ZodError);
  });

  it('rejects names longer than 40 chars (matches SQL varchar(40))', () => {
    expect(() =>
      FieldDefinitionSchema.parse({
        ...VALID_FIELD_DEFINITION,
        name: 'a'.repeat(41),
      }),
    ).toThrow(z.ZodError);
  });

  it('rejects an unknown FieldType', () => {
    expect(() =>
      FieldDefinitionSchema.parse({ ...VALID_FIELD_DEFINITION, type: 'boolean' }),
    ).toThrow(z.ZodError);
  });

  it('accepts all 4 valid field types', () => {
    for (const t of ['text', 'number', 'date', 'select']) {
      expect(() =>
        FieldDefinitionSchema.parse({ ...VALID_FIELD_DEFINITION, type: t }),
      ).not.toThrow();
    }
  });

  it('accepts null options (JSONB semantics)', () => {
    expect(() =>
      FieldDefinitionSchema.parse({ ...VALID_FIELD_DEFINITION, options: null }),
    ).not.toThrow();
  });

  it('accepts a string array of options for select type', () => {
    expect(() =>
      FieldDefinitionSchema.parse({
        ...VALID_FIELD_DEFINITION,
        type: 'select',
        options: ['金融', '制造', '互联网'],
      }),
    ).not.toThrow();
  });
});

const VALID_FIELD_VALUE = {
  opportunity_id: UUID,
  field_id: UUID,
  value: '银行业',
};

describe('FieldValueSchema', () => {
  it('accepts a populated value', () => {
    expect(() => FieldValueSchema.parse(VALID_FIELD_VALUE)).not.toThrow();
  });

  it('accepts null value (no value yet or explicitly cleared)', () => {
    expect(() =>
      FieldValueSchema.parse({ ...VALID_FIELD_VALUE, value: null }),
    ).not.toThrow();
  });

  it('accepts empty-string value', () => {
    expect(() =>
      FieldValueSchema.parse({ ...VALID_FIELD_VALUE, value: '' }),
    ).not.toThrow();
  });

  it('rejects non-UUID opportunity_id', () => {
    expect(() =>
      FieldValueSchema.parse({ ...VALID_FIELD_VALUE, opportunity_id: 'bad' }),
    ).toThrow(z.ZodError);
  });

  it('rejects non-UUID field_id', () => {
    expect(() =>
      FieldValueSchema.parse({ ...VALID_FIELD_VALUE, field_id: 'bad' }),
    ).toThrow(z.ZodError);
  });
});

// ─── v0.2 — Chart datum schema (Phase C) ───────────────────────────────────
// Used by DonutChart / BarChart. `value` is `z.number()` (no min(0) — that
// would forbid SLA "remaining" gauges in the future), so the schema allows
// negative numbers — we don't test for rejection there.

describe('ChartDatumSchema', () => {
  it('accepts a label + numeric value', () => {
    expect(() =>
      ChartDatumSchema.parse({ label: '已立项', value: 12 }),
    ).not.toThrow();
  });

  it('accepts zero', () => {
    expect(() =>
      ChartDatumSchema.parse({ label: '已关闭', value: 0 }),
    ).not.toThrow();
  });

  it('accepts negative value (current schema is z.number())', () => {
    // Documenting the intentional behavior — ChartDatumSchema does NOT
    // enforce non-negative values. If a future chart needs that, add `.min(0)`
    // and update this test to expect rejection instead.
    expect(() =>
      ChartDatumSchema.parse({ label: 'delta', value: -3 }),
    ).not.toThrow();
  });

  it('accepts fractional values (Recharts formats decimals)', () => {
    expect(() =>
      ChartDatumSchema.parse({ label: 'avg', value: 4.5 }),
    ).not.toThrow();
  });

  it('rejects a non-string label', () => {
    expect(() =>
      ChartDatumSchema.parse({ label: 5, value: 1 }),
    ).toThrow(z.ZodError);
  });

  it('rejects a non-numeric value', () => {
    expect(() =>
      ChartDatumSchema.parse({ label: 'x', value: 'ten' }),
    ).toThrow(z.ZodError);
  });
});

// ─── v0.3 — Opportunity tag schema (Phase C) ────────────────────────────────
// Composite PK (opportunity_id, tag). Mirrors the SQL CHECK constraint in
// 0007_opportunity_tags.sql: `length(tag) between 1 and 40`. If this schema
// drifts from the SQL, an insert can succeed on the DB and then fail when the
// row is read back through the typed Supabase client.

const VALID_OPPORTUNITY_TAG = {
  opportunity_id: UUID,
  tag: '金融',
  created_at: NOW,
};

describe('OpportunityTagSchema', () => {
  it('accepts a fully populated tag row', () => {
    expect(() => OpportunityTagSchema.parse(VALID_OPPORTUNITY_TAG)).not.toThrow();
  });

  it('accepts a tag row without created_at (DB provides default now())', () => {
    // Mirror the Inserts of the typed Supabase client: created_at is optional
    // because Postgres fills it in via `default now()`.
    expect(() =>
      OpportunityTagSchema.parse({ opportunity_id: UUID, tag: '金融' }),
    ).not.toThrow();
  });

  it('rejects an empty tag (mirrors SQL CHECK length(tag) >= 1)', () => {
    expect(() =>
      OpportunityTagSchema.parse({ ...VALID_OPPORTUNITY_TAG, tag: '' }),
    ).toThrow(z.ZodError);
  });

  it('rejects a tag longer than 40 chars (mirrors SQL CHECK length(tag) <= 40)', () => {
    expect(() =>
      OpportunityTagSchema.parse({ ...VALID_OPPORTUNITY_TAG, tag: 'a'.repeat(41) }),
    ).toThrow(z.ZodError);
  });

  it('accepts a tag of exactly 40 chars (boundary)', () => {
    // Pins the inclusive upper bound — a regression that tightens to 39 would
    // silently break the longest legal tags users can type.
    expect(() =>
      OpportunityTagSchema.parse({ ...VALID_OPPORTUNITY_TAG, tag: 'a'.repeat(40) }),
    ).not.toThrow();
  });

  it('rejects a missing opportunity_id', () => {
    const { opportunity_id: _omitted, ...withoutOppId } = VALID_OPPORTUNITY_TAG;
    expect(() => OpportunityTagSchema.parse(withoutOppId)).toThrow(z.ZodError);
  });

  it('rejects an invalid UUID in opportunity_id', () => {
    expect(() =>
      OpportunityTagSchema.parse({ ...VALID_OPPORTUNITY_TAG, opportunity_id: 'not-a-uuid' }),
    ).toThrow(z.ZodError);
  });
});
