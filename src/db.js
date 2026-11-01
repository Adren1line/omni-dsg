'use strict';
/**
 * База данных Omni DSG — встроенный SQLite (node:sqlite), без внешних пакетов.
 * Миграции идут по номеру версии в таблице meta.
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS = [
  // 1 — пользователи, должности, сессии, проекты, файлы, журнал
  `
  CREATE TABLE positions (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL UNIQUE,
    kontur    TEXT NOT NULL DEFAULT 'view' CHECK (kontur IN ('none','view','notes','edit')),
    stages    TEXT NOT NULL DEFAULT '[]',          -- JSON: номера стадий 0..5
    perms     TEXT NOT NULL DEFAULT '{}',          -- JSON: { crm:true, storage:true, ... }
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE users (
    id           INTEGER PRIMARY KEY,
    login        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name         TEXT NOT NULL,
    pass_hash    TEXT NOT NULL,
    role         TEXT NOT NULL CHECK (role IN ('admin','director','staff','client')),
    position_id  INTEGER REFERENCES positions(id) ON DELETE SET NULL,
    phone        TEXT,
    active       INTEGER NOT NULL DEFAULT 1,
    must_change  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    ip         TEXT,
    ua         TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE projects (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    address    TEXT,
    area       REAL,
    stage      INTEGER NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 5),
    stage_pct  INTEGER NOT NULL DEFAULT 0 CHECK (stage_pct BETWEEN 0 AND 100),
    lead_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    client_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    due        TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE project_members (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
  );
  CREATE TABLE files (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    size        INTEGER NOT NULL,
    mime        TEXT,
    sha256      TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    public      INTEGER NOT NULL DEFAULT 0,      -- 1 = видно заказчику
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX files_project ON files(project_id);
  CREATE TABLE audit (
    id      INTEGER PRIMARY KEY,
    ts      TEXT NOT NULL DEFAULT (datetime('now')),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    kind    TEXT NOT NULL,
    text    TEXT NOT NULL,
    ip      TEXT
  );
  CREATE INDEX audit_ts ON audit(ts);
  `
];

function open(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'omni.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  const row = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get();
  let version = row ? Number(row.value) : 0;
  while (version < MIGRATIONS.length) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      version++;
      db.prepare("INSERT INTO meta(key,value) VALUES('schema_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(version));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}

/** Выполняет fn в транзакции. */
function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { open, tx };
