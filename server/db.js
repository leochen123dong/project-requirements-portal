// db.js — better-sqlite3 wrapper + migrations runner
import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const DB_PATH = join(DATA_DIR, 'portal.db');
const MIGRATIONS_DIR = join(__dirname, 'migrations');

import { mkdirSync } from 'node:fs';
mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/** Run all .sql files in migrations/ sorted by filename, tracking applied versions. */
function runMigrations() {
  db.exec(`
    create table if not exists _migrations (
      name text primary key,
      applied_at text not null default (datetime('now'))
    );
  `);
  const applied = new Set(
    db.prepare('select name from _migrations').all().map((r) => r.name)
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    console.log(`[db] applying migration ${f}`);
    db.exec(sql);
    db.prepare('insert into _migrations (name) values (?)').run(f);
  }
}
runMigrations();

/** Append an audit_log entry. Called from route handlers. */
export function audit({ actorId, action, entity, entityId, payload }) {
  db.prepare(`
    insert into audit_log (actor_id, action, entity, entity_id, payload)
    values (?, ?, ?, ?, ?)
  `).run(actorId ?? null, action, entity, entityId ?? null, payload ? JSON.stringify(payload) : null);
}

/** Pretty print the DB path on startup so the user can find it for backups. */
console.log(`[db] SQLite at ${DB_PATH}`);
