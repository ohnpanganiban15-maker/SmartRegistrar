/* =====================================================
   db.js — SQLite database (built-in node:sqlite)
   Creates the schema on first run. No native modules
   or extra packages needed.
===================================================== */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const dbFile = path.isAbsolute(config.DB_PATH)
  ? config.DB_PATH
  : path.join(__dirname, '..', config.DB_PATH);

fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const db = new DatabaseSync(dbFile);
db.exec('PRAGMA foreign_keys = ON;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER REFERENCES students(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('admin','student')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  student_number TEXT UNIQUE,
  first_name    TEXT NOT NULL,
  middle_name   TEXT NOT NULL DEFAULT '',
  last_name     TEXT NOT NULL,
  grade_level   TEXT NOT NULL DEFAULT '',
  strand        TEXT NOT NULL DEFAULT '',
  contact       TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS appointment_slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, start_time, end_time)
);

CREATE TABLE IF NOT EXISTS appointments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ref          TEXT NOT NULL UNIQUE,
  slot_id      INTEGER NOT NULL REFERENCES appointment_slots(id) ON DELETE RESTRICT,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  service      TEXT NOT NULL,
  purpose      TEXT NOT NULL DEFAULT '',
  date         TEXT NOT NULL,
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'Pending'
               CHECK(status IN ('Pending','Approved','Confirmed','Completed','Cancelled','Rejected')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_types (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS document_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ref         TEXT NOT NULL UNIQUE,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  doc_type    TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  purpose     TEXT NOT NULL DEFAULT '',
  pickup_date TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'Pending'
              CHECK(status IN ('Pending','Processing','Ready for Pickup','Completed','Rejected','Cancelled')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'info',
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  subject      TEXT NOT NULL,
  body         TEXT NOT NULL,
  admin_reply  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Resolved')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  replied_at   TEXT
);

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS request_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id   INTEGER NOT NULL REFERENCES document_requests(id) ON DELETE CASCADE,
  sender_role  TEXT NOT NULL CHECK(sender_role IN ('student','admin')),
  sender_id    INTEGER NOT NULL,
  sender_name  TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL,
  read_student INTEGER NOT NULL DEFAULT 0,
  read_admin   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  user_name  TEXT NOT NULL DEFAULT 'system',
  action     TEXT NOT NULL,
  details    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,
  purpose     TEXT NOT NULL CHECK(purpose IN ('register','change_password')),
  code_hash   TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appt_slot     ON appointments(slot_id);
CREATE INDEX IF NOT EXISTS idx_appt_student  ON appointments(student_id);
CREATE INDEX IF NOT EXISTS idx_req_student   ON document_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_notif_user    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_rmsg_request  ON request_messages(request_id);
CREATE INDEX IF NOT EXISTS idx_slot_date     ON appointment_slots(date);
`;

db.exec(SCHEMA);

/* ---- lightweight migrations (adds columns to older databases) ---- */
function ensureColumn(table, def) {
  const name = def.split(/\s+/)[0];
  const cols = db.prepare('PRAGMA table_info(' + table + ')').all();
  if (!cols.some(c => c.name === name)) db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + def);
}
ensureColumn('users', 'failed_attempts INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', "locked_until TEXT NOT NULL DEFAULT ''");
ensureColumn('users', 'token_version INTEGER NOT NULL DEFAULT 0');
ensureColumn('students', "profile_photo TEXT NOT NULL DEFAULT ''");

/* ---- ensure required document types exist (safe on old + fresh DBs) ---- */
const insertDocType = db.prepare('INSERT OR IGNORE INTO document_types (name) VALUES (?)');
for (const t of ['SF9', 'SF10']) insertDocType.run(t);

/* ---- google sign-in: link column (added once, safe on old DBs) ---- */
try { db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT'); } catch (e) { /* already exists */ }

/* ---- doc-type cleanup: drop retired options, rename Certification ----
   Runs at boot AND again after a persistence restore (an old snapshot may
   still carry the retired types). Idempotent. */
function migrateDocTypes() {
  const drop = db.prepare('DELETE FROM document_types WHERE name=?');
  for (const t of ['Form 137', 'Form 138', 'Good Moral Certificate', 'Transcript of Records']) drop.run(t);
  db.prepare("INSERT OR IGNORE INTO document_types (name) VALUES ('Certified True Copy')").run();
  db.prepare("DELETE FROM document_types WHERE name='Certification'").run();
  db.prepare("UPDATE document_requests SET doc_type='Certified True Copy' WHERE doc_type='Certification'").run();
}
migrateDocTypes();

/* ---- small query helpers used by all routes ---- */
const q = {
  get: (sql, ...params) => db.prepare(sql).get(...params),
  all: (sql, ...params) => db.prepare(sql).all(...params),
  run: (sql, ...params) => db.prepare(sql).run(...params)
};

/* write an activity log entry */
function logActivity(userId, userName, action, details) {
  q.run(
    'INSERT INTO activity_logs (user_id, user_name, action, details) VALUES (?,?,?,?)',
    userId ?? null, userName || 'system', action, details || ''
  );
}

module.exports = { db, q, logActivity, migrateDocTypes };
