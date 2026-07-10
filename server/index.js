// index.js — main Express server entry point
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import 'dotenv/config';

import './db.js'; // runs migrations on import
import { seedIfEmpty } from './seed.js';
seedIfEmpty();

import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import opportunityRoutes from './routes/opportunities.js';
import projectRoutes from './routes/projects.js';
import commentRoutes from './routes/comments.js';
import tagRoutes from './routes/tags.js';
import fieldRoutes from './routes/fields.js';
import artifactRoutes from './routes/artifacts.js';
import dashboardRoutes from './routes/dashboard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = join(__dirname, '..', 'web', 'dist');
const UPLOADS_DIR = join(__dirname, 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', requireAuth, userRoutes);
app.use('/api/opportunities', requireAuth, opportunityRoutes);
app.use('/api/projects', requireAuth, projectRoutes);
app.use('/api/comments', requireAuth, commentRoutes);
app.use('/api/tag-definitions', requireAuth, tagRoutes);
app.use('/api/field-definitions', requireAuth, fieldRoutes);
app.use('/api/artifacts', requireAuth, artifactRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_DIR, {
  setHeaders: (res) => res.set('Content-Disposition', 'inline'),
}));

// Serve static frontend (built static files)
if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { maxAge: '1h', index: 'index.html' }));
  // SPA fallback: any non-/api, non-/uploads request → index.html
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
    res.sendFile(join(WEB_DIST, 'index.html'));
  });
} else {
  console.warn(`[server] WARNING: ${WEB_DIST} not found. Run \`npm run build\` in web/ first.`);
}

// Health check
app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on http://0.0.0.0:${PORT}`);
  console.log(`[server] frontend: ${existsSync(WEB_DIST) ? 'served from ' + WEB_DIST : 'NOT BUILT (run npm run build in web/)'}`);
});
