// routes/users.js — admin user management (replaces v0.4 admin-users Edge Function)
import { Router } from 'express';
import { db } from '../db.js';
import { requireRole, hashPassword } from '../auth.js';

const router = Router();

/** Map a profile row from DB to the public shape (no password_hash). */
function publicProfile(row) {
  if (!row) return row;
  const { password_hash, ...rest } = row;
  return rest;
}

/** GET /api/users — list all profiles (admin only) */
router.get('/', requireRole('admin'), (req, res) => {
  const rows = db.prepare(`
    select id, email, display_name, role, created_at
    from profiles
    order by created_at asc
  `).all();
  res.json(rows);
});

/** POST /api/users { email, password, role, display_name } — create (admin only) */
router.post('/', requireRole('admin'), (req, res) => {
  const { email, password, role, display_name } = req.body || {};
  if (!email || !password || !role || !display_name) {
    return res.status(400).json({ error: 'email, password, role, display_name required' });
  }
  if (!['presales', 'pm', 'delivery', 'postsales', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'invalid role' });
  }
  const existing = db.prepare('select id from profiles where email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'email already exists' });
  const id = (lower_hex_randomblob());
  db.prepare(`
    insert into profiles (id, email, password_hash, display_name, role)
    values (?, ?, ?, ?, ?)
  `).run(id, email, hashPassword(password), display_name, role);
  const row = db.prepare('select id, email, display_name, role, created_at from profiles where id = ?').get(id);
  res.status(201).json(publicProfile(row));
});

/** PATCH /api/users/:id { role?, display_name? } — update (admin only) */
router.patch('/:id', requireRole('admin'), (req, res) => {
  const { role, display_name } = req.body || {};
  if (!role && !display_name) return res.status(400).json({ error: 'no fields to update' });
  if (role && !['presales', 'pm', 'delivery', 'postsales', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'invalid role' });
  }
  const existing = db.prepare('select id from profiles where id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const fields = [];
  const values = [];
  if (role) { fields.push('role = ?'); values.push(role); }
  if (display_name) { fields.push('display_name = ?'); values.push(display_name); }
  values.push(req.params.id);
  db.prepare(`update profiles set ${fields.join(', ')} where id = ?`).run(...values);
  const row = db.prepare('select id, email, display_name, role, created_at from profiles where id = ?').get(req.params.id);
  res.json(publicProfile(row));
});

/** POST /api/users/:id/password { password } — reset password (admin only) */
router.post('/:id/password', requireRole('admin'), (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'password (min 6 chars) required' });
  }
  const existing = db.prepare('select id from profiles where id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare('update profiles set password_hash = ? where id = ?').run(hashPassword(password), req.params.id);
  res.status(204).end();
});

/** DELETE /api/users/:id — delete (admin only, cascade) */
router.delete('/:id', requireRole('admin'), (req, res) => {
  const result = db.prepare('delete from profiles where id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

/** Generate a fresh UUID in JS (matches SQL's `lower(hex(randomblob(16)))`) */
function lower_hex_randomblob() {
  const bytes = require('crypto').randomBytes(16);
  return bytes.toString('hex');
}

export default router;
