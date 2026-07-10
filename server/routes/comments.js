// routes/comments.js — polymorphic comments (currently opportunity-scoped)
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db, audit } from '../db.js';

const router = Router();

/** GET /api/comments?target_type=opportunity&target_id=... */
router.get('/', (req, res) => {
  const { target_type, target_id } = req.query;
  if (!target_type || !target_id) return res.status(400).json({ error: 'target_type and target_id required' });
  const rows = db.prepare(`
    select c.*, p.display_name as author_name
    from comments c
    left join profiles p on p.id = c.author_id
    where c.target_type = ? and c.target_id = ?
    order by c.created_at asc
  `).all(target_type, target_id);
  res.json(rows);
});

/** POST /api/comments — create (any authenticated) */
router.post('/', (req, res) => {
  const { target_type, target_id, body } = req.body || {};
  if (!target_type || !target_id || !body) {
    return res.status(400).json({ error: 'target_type, target_id, body required' });
  }
  const id = randomUUID();
  db.prepare(`
    insert into comments (id, target_type, target_id, author_id, body) values (?, ?, ?, ?, ?)
  `).run(id, target_type, target_id, req.user.sub, body);
  audit({ actorId: req.user.sub, action: 'insert', entity: 'comments', entityId: id, payload: { target_type, target_id } });
  res.status(201).json(db.prepare(`
    select c.*, p.display_name as author_name from comments c
    left join profiles p on p.id = c.author_id where c.id = ?
  `).get(id));
});

/** DELETE /api/comments/:id — author or admin only */
router.delete('/:id', (req, res) => {
  const c = db.prepare('select * from comments where id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  if (c.author_id !== req.user.sub && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  db.prepare('delete from comments where id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
