'use strict';
/* База данных: встроенный в Node SQLite, один файл data/craftory.db */
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  bio TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  avatar TEXT,
  pass_hash TEXT NOT NULL,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'file')),
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT REFERENCES uploads(id) ON DELETE SET NULL,
  categories TEXT NOT NULL DEFAULT '[]',
  client_side TEXT NOT NULL,
  server_side TEXT NOT NULL,
  license TEXT NOT NULL,
  links TEXT NOT NULL DEFAULT '{}',
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'unlisted', 'withheld')),
  visibility TEXT NOT NULL DEFAULT 'published',
  featured INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0,
  followers INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS projects_type ON projects(type, status);

CREATE TABLE IF NOT EXISTS members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  ord INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS members_user ON members(user_id);

CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('release', 'beta', 'alpha')),
  loaders TEXT NOT NULL,
  game_versions TEXT NOT NULL,
  changelog TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  downloads INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, number)
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  upload_id TEXT REFERENCES uploads(id) ON DELETE SET NULL,
  ord INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS files_version ON files(version_id);

CREATE TABLE IF NOT EXISTS deps (
  version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('required', 'optional', 'incompatible')),
  PRIMARY KEY (version_id, project_id)
);

CREATE TABLE IF NOT EXISTS gallery (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  gen INTEGER,
  upload_id TEXT REFERENCES uploads(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  ord INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS follows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
CREATE INDEX IF NOT EXISTS follows_project ON follows(project_id);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  public INTEGER NOT NULL DEFAULT 1,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  added INTEGER NOT NULL,
  PRIMARY KEY (collection_id, project_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stats (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, day)
);
`;

const DATA_TABLES = ['stats', 'reports', 'notifications', 'collection_items', 'collections', 'follows', 'gallery', 'deps', 'files', 'versions', 'members', 'projects', 'uploads', 'sessions', 'users'];

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

/* Транзакция: всё или ничего */
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function wipe(db) {
  tx(db, () => { for (const t of DATA_TABLES) db.exec(`DELETE FROM ${t}`); db.exec("DELETE FROM meta WHERE key = 'seeded'"); });
}

const json = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

module.exports = { openDb, tx, wipe, json };
