// routes/fields.js — custom field definitions + per-opportunity values
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();

/** GET /api/field-definitions — list active (or all for admin) */
router.get('/', (req, res) => {
  const rows = db.prepare(`
    select * from opportunity_field_definitions
    where is_active = 1 or ? = 1
    order by display_order asc
  `).all(req.user?.role === 'admin' ? 1 : 0);
  res.json(rows);
});

/** POST /api/field-definitions — create (admin) */
router.post('/', requireRole('admin'), (req, res) => {
  const { field, label, type, options, is_required, display_order } = req.body || {};
  if (!field || !label || !type) return res.status(400).json({ error: 'field, label, type required' });
  if (!['text', 'number', 'date', 'select'].includes(type)) return res.status(400).json({ error: 'invalid type' });
  const id = randomUUID();
  try {
    db.prepare(`
      insert into opportunity_field_definitions (id, field, label, type, options, is_required, display_order)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run(id, field, label, type, options ? JSON.stringify(options) : null,
        is_required ? 1 : 0, display_order ?? 0);
  } catch (e) {
    return res.status(409).json({ error: e.message });
  }
  res.status(201).json(db.prepare('select * from opportunity_field_definitions where id = ?').get(id));
});

/** PATCH /api/field-definitions/:id — update (admin) */
router.patch('/:id', requireRole('admin'), (req, res) => {
  const allowed = ['field', 'label', 'type', 'options', 'is_required', 'display_order', 'is_active'];
  const updates = [];
  const values = [];
  for (const k of allowed) {
    if (k in req.body) {
      updates.push(`${k} = ?`);
      let v = req.body[k];
      if (k === 'options' && typeof v === 'object') v = JSON.stringify(v);
      if (k === 'is_required' || k === 'is_active') v = v ? 1 : 0;
      values.push(v);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'no fields' });
  values.push(req.params.id);
  try {
    db.prepare(`update opportunity_field_definitions set ${updates.join(', ')} where id = ?`).run(...values);
  } catch (e) {
    return res.status(409).json({ error: e.message });
  }
  res.json(db.prepare('select * from opportunity_field_definitions where id = ?').get(req.params.id));
});

/** DELETE /api/field-definitions/:id — delete (admin, cascades) */
router.delete('/:id', requireRole('admin'), (req, res) => {
  const result = db.prepare('delete from opportunity_field_definitions where id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

/** GET /api/opportunities/:id/fields — get values for an opportunity */
router.get('/opportunities/:oppId/fields', (req, res) => {
  const rows = db.prepare(`
    select fv.field_id, fv.value, fd.field, fd.label, fd.type
    from opportunity_field_values fv
    join opportunity_field_definitions fd on fd.id = fv.field_id
    where fv.opportunity_id = ?
  `).all(req.params.oppId);
  res.json(rows);
});

/** PUT /api/opportunities/:id/fields/:fieldId { value } — upsert value (presales/admin) */
router.put('/opportunities/:oppId/fields/:fieldId', requireRole('presales', 'admin'), (req, res) => {
  const { value } = req.body || {};
  if (value === undefined) return res.status(400).json({ error: 'value required' });
  // upsert
  db.prepare(`
    insert into opportunity_field_values (opportunity_id, field_id, value) values (?, ?, ?)
    on conflict (opportunity_id, field_id) do update set value = excluded.value
  `).run(req.params.oppId, req.params.fieldId, value === '' ? null : String(value));
  res.json({ opportunity_id: req.params.oppId, field_id: req.params.fieldId, value });
});

export default router;
