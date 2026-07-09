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
