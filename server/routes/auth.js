// routes/auth.js — login / logout / me
import { Router } from 'express';
import { db } from '../db.js';
import { findProfileByEmail, findProfileById, signToken, verifyPassword, requireAuth } from '../auth.js';

const router = Router();

/** POST /api/auth/login { email, password } → { token, profile } */
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }
  const profile = findProfileByEmail(email);
  if (!profile || !verifyPassword(password, profile.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = signToken(profile);
  // Strip password_hash from the public profile object
  const { password_hash, ...publicProfile } = profile;
  res.json({ token, profile: publicProfile });
});

/** POST /api/auth/logout — stateless JWT, just returns 204 */
router.post('/logout', (req, res) => {
  res.status(204).end();
});

/** GET /api/auth/me — current user (requireAuth) */
router.get('/me', requireAuth, (req, res) => {
  const profile = findProfileById(req.user.sub);
  if (!profile) return res.status(404).json({ error: 'profile not found' });
  const { password_hash, ...publicProfile } = profile;
  res.json(publicProfile);
});

export default router;
