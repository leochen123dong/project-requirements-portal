// routes/projects.js — CRUD for projects (created from opportunity handover)
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db, audit } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();

/** GET /api/projects — list */
router.get('/', (req, res) => {
  const rows = db.prepare(`
    select p.*, o.name as opportunity_name, pm.display_name as pm_name,
           del.display_name as delivery_name
    from projects p
    join opportunities o on o.id = p.opportunity_id
    left join profiles pm on pm.id = p.pm_id
    left join profiles del on del.id = p.delivery_id
    order by p.created_at desc
  `).all();
  res.json(rows);
});

/** GET /api/projects/:id — full detail */
router.get('/:id', (req, res) => {
  const p = db.prepare(`
    select p.*, o.name as opportunity_name from projects p
    join opportunities o on o.id = p.opportunity_id
    where p.id = ?
  `).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  const milestones = db.prepare(`
    select * from milestones where project_id = ? order by "order"
  `).all(req.params.id);
  // Attach tasks per milestone
  for (const m of milestones) {
    m.tasks = db.prepare('select * from tasks where milestone_id = ?').all(m.id);
  }
  const artifacts = db.prepare(`
    select a.*, ad.label, ad.description
    from artifacts a
    left join artifact_definitions ad on ad.id = a.artifact_definition_id
    where a.project_id = ?
    order by a.created_at desc
  `).all(req.params.id);
  p.milestones = milestones;
  p.artifacts = artifacts;
  res.json(p);
});

/** PATCH /api/projects/:id — update (pm/admin) */
router.patch('/:id', requireRole('pm', 'admin'), (req, res) => {
  const allowed = ['name', 'pm_id', 'delivery_id', 'status', 'required_artifacts', 'ithub_ticket_id'];
  const updates = [];
  const values = [];
  for (const k of allowed) {
    if (k in req.body) {
      updates.push(`${k} = ?`);
      values.push(typeof req.body[k] === 'object' ? JSON.stringify(req.body[k]) : req.body[k]);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'no fields' });
  values.push(req.params.id);
  db.prepare(`update projects set ${updates.join(', ')} where id = ?`).run(...values);
  audit({ actorId: req.user.sub, action: 'update', entity: 'projects', entityId: req.params.id, payload: req.body });
  res.json(db.prepare('select * from projects where id = ?').get(req.params.id));
});

/** POST /api/projects/:id/milestones — create milestone (pm/admin) */
router.post('/:id/milestones', requireRole('pm', 'admin'), (req, res) => {
  const { name, phase, due_date } = req.body || {};
  if (!name || !phase || !due_date) return res.status(400).json({ error: 'name, phase, due_date required' });
  const id = randomUUID();
  const order = (db.prepare('select coalesce(max("order"), 0) + 1 as o from milestones where project_id = ?').get(req.params.id)).o;
  db.prepare(`
    insert into milestones (id, project_id, name, phase, due_date, "order")
    values (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, name, phase, due_date, order);
  res.status(201).json(db.prepare('select * from milestones where id = ?').get(id));
});

/** PATCH /api/milestones/:id — update milestone status (pm/admin/delivery) */
router.patch('/milestones/:id', requireRole('pm', 'delivery', 'admin'), (req, res) => {
  const { status } = req.body || {};
  if (!status || !['pending', 'in_progress', 'done', 'blocked'].includes(status)) {
    return res.status(400).json({ error: 'valid status required' });
  }
  db.prepare('update milestones set status = ? where id = ?').run(status, req.params.id);
  res.json(db.prepare('select * from milestones where id = ?').get(req.params.id));
});

/** POST /api/milestones/:mid/tasks — create task (pm/admin) */
router.post('/milestones/:mid/tasks', requireRole('pm', 'admin'), (req, res) => {
  const { assignee_id, title, due_date } = req.body || {};
  if (!assignee_id || !title) return res.status(400).json({ error: 'assignee_id and title required' });
  const id = randomUUID();
  db.prepare(`
    insert into tasks (id, milestone_id, assignee_id, title, due_date) values (?, ?, ?, ?, ?)
  `).run(id, req.params.mid, assignee_id, title, due_date || null);
  res.status(201).json(db.prepare('select * from tasks where id = ?').get(id));
});

/** PATCH /api/tasks/:id — toggle done (assignee/pm/admin) */
router.patch('/tasks/:id', (req, res) => {
  const { done } = req.body || {};
  if (typeof done !== 'boolean') return res.status(400).json({ error: 'done (boolean) required' });
  db.prepare('update tasks set done = ? where id = ?').run(done ? 1 : 0, req.params.id);
  res.json(db.prepare('select * from tasks where id = ?').get(req.params.id));
});

export default router;
