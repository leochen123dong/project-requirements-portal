// routes/tags.js — admin-managed tag definitions + per-opportunity tag values
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db, audit } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();

/** GET /api/tag-definitions — list all (active) tag definitions (any auth) */
router.get('/', (req, res) => {
  const rows = db.prepare(`
    select id, tag, label, color, display_order, is_active
    from opportunity_tag_definitions
    where is_active = 1 or ? = 1
    order by display_order asc, tag asc
  `).all(req.user?.role === 'admin' ? 1 : 0);
  res.json(rows);
});

/** POST /api/tag-definitions — create (admin) */
router.post('/', requireRole('admin'), (req, res) => {
  const { tag, label, color, display_order } = req.body || {};
  if (!tag || !label) return res.status(400).json({ error: 'tag and label required' });
  const id = randomUUID();
  try {
    db.prepare(`
      insert into opportunity_tag_definitions (id, tag, label, color, display_order)
      values (?, ?, ?, ?, ?)
    `).run(id, tag, label, color || 'tag-info', display_order ?? 0);
  } catch (e) {
    return res.status(409).json({ error: e.message });
  }
  res.status(201).json(db.prepare('select * from opportunity_tag_definitions where id = ?').get(id));
});

/** PATCH /api/tag-definitions/:id — update (admin) */
router.patch('/:id', requireRole('admin'), (req, res) => {
  const existing = db.prepare('select * from opportunity_tag_definitions where id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const allowed = ['tag', 'label', 'color', 'display_order', 'is_active'];
  const updates = [];
  const values = [];
  for (const k of allowed) {
    if (k in req.body) { updates.push(`${k} = ?`); values.push(req.body[k]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'no fields' });
  values.push(req.params.id);
  try {
    db.prepare(`update opportunity_tag_definitions set ${updates.join(', ')} where id = ?`).run(...values);
  } catch (e) {
    return res.status(409).json({ error: e.message });
  }
  res.json(db.prepare('select * from opportunity_tag_definitions where id = ?').get(req.params.id));
});

/** DELETE /api/tag-definitions/:id — delete (admin, cascades to values) */
router.delete('/:id', requireRole('admin'), (req, res) => {
  const result = db.prepare('delete from opportunity_tag_definitions where id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

/** GET /api/opportunities/:id/tags — list tags on an opportunity */
router.get('/opportunities/:oppId/tags', (req, res) => {
  const rows = db.prepare(`
    select v.tag_id, d.tag, d.label, d.color
    from opportunity_tag_values v
    join opportunity_tag_definitions d on d.id = v.tag_id
    where v.opportunity_id = ?
    order by d.display_order
  `).all(req.params.oppId);
  res.json(rows);
});

/** POST /api/opportunities/:id/tags { tag_id } — add (presales/admin) */
router.post('/opportunities/:oppId/tags', requireRole('presales', 'admin'), (req, res) => {
  const { tag_id } = req.body || {};
  if (!tag_id) return res.status(400).json({ error: 'tag_id required' });
  try {
    db.prepare(`
      insert into opportunity_tag_values (opportunity_id, tag_id) values (?, ?)
    `).run(req.params.oppId, tag_id);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(204).end();
    return res.status(500).json({ error: e.message });
  }
  res.status(201).end();
});

/** DELETE /api/opportunities/:id/tags/:tagId — remove (presales/admin) */
router.delete('/opportunities/:oppId/tags/:tagId', requireRole('presales', 'admin'), (req, res) => {
  db.prepare(`
    delete from opportunity_tag_values where opportunity_id = ? and tag_id = ?
  `).run(req.params.oppId, req.params.tagId);
  res.status(204).end();
});

export default router;
