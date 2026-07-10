// routes/artifacts.js — file uploads (replaces Supabase Storage)
import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, audit } from '../db.js';
import { requireRole } from '../auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // Sub-directory by entity (opportunity_id or project_id)
      const entity = req.body.opportunity_id ? 'opportunities' : req.body.project_id ? 'projects' : 'misc';
      const id = req.body.opportunity_id || req.body.project_id || 'unknown';
      const dir = join(UPLOADS_DIR, entity, id);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^\w.\-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const router = Router();

/** GET /api/artifacts/definitions — list active artifact types (any auth) */
router.get('/definitions', (req, res) => {
  const rows = db.prepare(`
    select * from artifact_definitions
    where is_active = 1 or ? = 1
    order by display_order asc
  `).all(req.user?.role === 'admin' ? 1 : 0);
  res.json(rows);
});

/** POST /api/artifacts/definitions — create (admin) */
router.post('/definitions', requireRole('admin'), (req, res) => {
  const { type, label, description, is_required, display_order } = req.body || {};
  if (!type || !label) return res.status(400).json({ error: 'type and label required' });
  const id = randomUUID();
  try {
    db.prepare(`
      insert into artifact_definitions (id, type, label, description, is_required, display_order)
      values (?, ?, ?, ?, ?, ?)
    `).run(id, type, label, description || null, is_required ? 1 : 0, display_order ?? 0);
  } catch (e) {
    return res.status(409).json({ error: e.message });
  }
  res.status(201).json(db.prepare('select * from artifact_definitions where id = ?').get(id));
});

/** PATCH /api/artifacts/definitions/:id — update (admin) */
router.patch('/definitions/:id', requireRole('admin'), (req, res) => {
  const allowed = ['type', 'label', 'description', 'is_required', 'display_order', 'is_active'];
  const updates = [];
  const values = [];
  for (const k of allowed) {
    if (k in req.body) {
      updates.push(`${k} = ?`);
      let v = req.body[k];
      if (k === 'is_required' || k === 'is_active') v = v ? 1 : 0;
      values.push(v);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'no fields' });
  values.push(req.params.id);
  try {
    db.prepare(`update artifact_definitions set ${updates.join(', ')} where id = ?`).run(...values);
  } catch (e) {
    return res.status(409).json({ error: e.message });
  }
  res.json(db.prepare('select * from artifact_definitions where id = ?').get(req.params.id));
});

/** DELETE /api/artifacts/definitions/:id — delete (admin, cascades) */
router.delete('/definitions/:id', requireRole('admin'), (req, res) => {
  const result = db.prepare('delete from artifact_definitions where id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

/** POST /api/artifacts/upload — multipart (presales/admin) */
router.post('/upload', requireRole('presales', 'admin'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const { opportunity_id, project_id, artifact_definition_id, type } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type required' });
  if (!opportunity_id && !project_id) return res.status(400).json({ error: 'opportunity_id or project_id required' });
  if (opportunity_id && project_id) return res.status(400).json({ error: 'only one of opportunity_id / project_id' });
  const relPath = path.relative(UPLOADS_DIR, req.file.path).replace(/\\/g, '/');
  const id = randomUUID();
  db.prepare(`
    insert into artifacts (id, artifact_definition_id, type, project_id, opportunity_id, storage_path, uploaded_by)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(id, artifact_definition_id || null, type, project_id || null, opportunity_id || null, relPath, req.user.sub);
  audit({ actorId: req.user.sub, action: 'insert', entity: 'artifacts', entityId: id, payload: { type, opportunity_id, project_id } });
  res.status(201).json(db.prepare('select * from artifacts where id = ?').get(id));
});

/** DELETE /api/artifacts/:id — presales/admin */
router.delete('/:id', requireRole('presales', 'admin'), (req, res) => {
  const a = db.prepare('select * from artifacts where id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  // Best-effort file delete
  try {
    unlinkSync(join(UPLOADS_DIR, a.storage_path));
  } catch (e) {
    console.warn('[artifacts] file delete failed:', e.message);
  }
  db.prepare('delete from artifacts where id = ?').run(req.params.id);
  res.status(204).end();
});

// Helper for relative path
import path from 'node:path';

export default router;
