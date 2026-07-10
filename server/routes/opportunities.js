// routes/opportunities.js — CRUD + custom fields + tags + comments + handover
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db, audit } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();

/** Role-based visibility for opportunity list:
 *  - presales sees opportunities they own or are assigned to
 *  - pm sees opportunities they own or are assigned to
 *  - delivery sees opportunities assigned to them
 *  - postsales sees ALL (for售后 service)
 *  - admin sees ALL
 *  For MVP simplicity, all authenticated users see all opportunities. */
function listQuery(req) {
  return db.prepare(`
    select o.*, p.display_name as owner_name, pres.display_name as presales_name,
           del.display_name as delivery_name
    from opportunities o
    left join profiles p on p.id = o.owner_id
    left join profiles pres on pres.id = o.presales_id
    left join profiles del on del.id = o.delivery_id
    order by o.updated_at desc
  `).all();
}

/** GET /api/opportunities — list */
router.get('/', (req, res) => {
  let rows = listQuery(req);
  if (req.query.stage) rows = rows.filter((o) => o.stage === req.query.stage);
  res.json(rows);
});

/** GET /api/opportunities/distribution?field=stage|tag — chart aggregate */
router.get('/distribution', (req, res) => {
  const field = req.query.field || 'stage';
  if (field === 'stage') {
    const stages = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
    const data = stages.map((s) => ({ label: s, value: db.prepare('select count(*) c from opportunities where stage = ?').get(s).c }));
    return res.json(data);
  }
  if (field === 'tag') {
    const rows = db.prepare(`
      select d.id, d.label, count(v.opportunity_id) as value
      from opportunity_tag_definitions d
      left join opportunity_tag_values v on v.tag_id = d.id
      where d.is_active = 1
      group by d.id, d.label
      order by d.display_order
    `).all();
    return res.json(rows);
  }
  res.status(400).json({ error: 'field must be stage or tag' });
});

/** GET /api/opportunities/:id — full detail with tags, custom fields, audit */
router.get('/:id', (req, res) => {
  const o = db.prepare('select * from opportunities where id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'not found' });
  const tags = db.prepare(`
    select v.tag_id, d.label, d.color
    from opportunity_tag_values v
    join opportunity_tag_definitions d on d.id = v.tag_id
    where v.opportunity_id = ?
  `).all(req.params.id);
  const fields = db.prepare(`
    select fv.field_id, fv.value, fd.field, fd.label, fd.type
    from opportunity_field_values fv
    join opportunity_field_definitions fd on fd.id = fv.field_id
    where fv.opportunity_id = ?
  `).all(req.params.id);
  const auditLog = db.prepare(`
    select id, actor_id, action, entity, entity_id, payload, at
    from audit_log
    where entity = 'opportunities' and entity_id = ?
    order by at desc
    limit 50
  `).all(req.params.id);
  res.json({ ...o, tags, fields, audit: auditLog });
});

/** POST /api/opportunities — create (presales/admin) */
router.post('/', requireRole('presales', 'admin'), (req, res) => {
  const { name, customer, amount, stage, presales_id, delivery_id } = req.body || {};
  if (!name || !customer) return res.status(400).json({ error: 'name and customer required' });
  const id = randomUUID();
  db.prepare(`
    insert into opportunities (id, name, customer, amount, stage, owner_id, presales_id, delivery_id)
    values (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, customer, amount ?? null, stage || 'lead', req.user.sub,
        presales_id || req.user.sub, delivery_id || null);
  audit({ actorId: req.user.sub, action: 'insert', entity: 'opportunities', entityId: id, payload: { name, customer } });
  res.status(201).json(db.prepare('select * from opportunities where id = ?').get(id));
});

/** PATCH /api/opportunities/:id — update fields (presales/admin) */
router.patch('/:id', requireRole('presales', 'admin'), (req, res) => {
  const existing = db.prepare('select * from opportunities where id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const allowed = ['name', 'customer', 'amount', 'stage', 'presales_id', 'delivery_id'];
  const updates = [];
  const values = [];
  for (const k of allowed) {
    if (k in req.body) { updates.push(`${k} = ?`); values.push(req.body[k]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'no updatable fields' });
  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);
  db.prepare(`update opportunities set ${updates.join(', ')} where id = ?`).run(...values);
  audit({ actorId: req.user.sub, action: 'update', entity: 'opportunities', entityId: req.params.id, payload: req.body });
  res.json(db.prepare('select * from opportunities where id = ?').get(req.params.id));
});

/** DELETE /api/opportunities/:id — delete (presales/admin) */
router.delete('/:id', requireRole('presales', 'admin'), (req, res) => {
  const result = db.prepare('delete from opportunities where id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  audit({ actorId: req.user.sub, action: 'delete', entity: 'opportunities', entityId: req.params.id });
  res.status(204).end();
});

/** POST /api/opportunities/:id/handover — create project from opportunity (presales/admin) */
router.post('/:id/handover', requireRole('presales', 'admin'), (req, res) => {
  const opp = db.prepare('select * from opportunities where id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'opportunity not found' });
  const { pm_id } = req.body || {};
  if (!pm_id) return res.status(400).json({ error: 'pm_id required' });
  const projectId = randomUUID();
  db.prepare(`
    insert into projects (id, opportunity_id, name, pm_id, delivery_id, status, required_artifacts)
    values (?, ?, ?, ?, ?, 'initiated', '[]')
  `).run(projectId, opp.id, opp.name, pm_id, opp.delivery_id);
  // Move any pre-handover artifacts from this opportunity to the new project
  db.prepare(`
    update artifacts
    set project_id = ?, opportunity_id = null
    where opportunity_id = ? and project_id is null
  `).run(projectId, opp.id);
  audit({ actorId: req.user.sub, action: 'insert', entity: 'projects', entityId: projectId, payload: { from_opportunity: opp.id } });
  res.status(201).json(db.prepare('select * from projects where id = ?').get(projectId));
});

export default router;
