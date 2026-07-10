// auth.js — JWT + bcrypt + Express middleware
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { db } from './db.js';

const SECRET = process.env.JWT_SECRET || (() => {
  // First-run: auto-generate and persist to .env so subsequent restarts are stable.
  const generated = randomBytes(32).toString('hex');
  console.warn(
    '[auth] JWT_SECRET not set. Generated a random one. To make tokens ' +
    'survive restarts, add this to your .env:\n  JWT_SECRET=' + generated
  );
  return generated;
})();
const TOKEN_TTL = '7d';

/** Hash a plain-text password with bcrypt (cost 10). */
export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

/** Verify a plain-text password against a bcrypt hash. */
export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

/** Sign a JWT for the given profile (id + role). */
export function signToken(profile) {
  return jwt.sign(
    { sub: profile.id, role: profile.role, email: profile.email },
    SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/** Verify a JWT and return the decoded payload, or null if invalid. */
export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

/** Express middleware: require a valid Bearer token, attach `req.user`. */
export function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = payload;
  next();
}

/** Express middleware: require the user to have one of the given roles. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || (req.user.role !== 'admin' && !roles.includes(req.user.role))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

/** Look up a profile row by email. Returns the row or undefined. */
export function findProfileByEmail(email) {
  return db.prepare('select * from profiles where email = ?').get(email);
}

/** Look up a profile row by id. */
export function findProfileById(id) {
  return db.prepare('select * from profiles where id = ?').get(id);
}
