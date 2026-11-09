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
/* wait (instead of failing) when another process/connection holds the DB */
db.exec('PRAGMA busy_timeout = 5000;');

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
  last_school_year TEXT NOT NULL DEFAULT '',
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
  pickup_time TEXT NOT NULL DEFAULT '',
  claimed_at  TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'Pending'
              /* Under Review is the new registrar triage step. Rejected/Cancelled
                 are kept ONLY so historical rows and old snapshots still restore;
                 the API/UI never write them anymore. */
              CHECK(status IN ('Pending','Under Review','Processing','Ready for Pickup','Completed','Rejected','Cancelled')),
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

CREATE TABLE IF NOT EXISTS feedback (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL DEFAULT '',
  rating       INTEGER NOT NULL DEFAULT 5 CHECK(rating >= 1 AND rating <= 5),
  comment      TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appt_slot     ON appointments(slot_id);
CREATE INDEX IF NOT EXISTS idx_appt_student  ON appointments(student_id);
CREATE INDEX IF NOT EXISTS idx_req_student   ON document_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_notif_user    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_rmsg_request  ON request_messages(request_id);
CREATE INDEX IF NOT EXISTS idx_slot_date     ON appointment_slots(date);
CREATE INDEX IF NOT EXISTS idx_feedback_student ON feedback(student_id);
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
ensureColumn('students', "last_school_year TEXT NOT NULL DEFAULT ''");
ensureColumn('document_requests', "pickup_time TEXT NOT NULL DEFAULT ''");
ensureColumn('document_requests', "claimed_at TEXT NOT NULL DEFAULT ''");
ensureColumn('document_requests', "completed_at TEXT NOT NULL DEFAULT ''");
/* P2 — document requirements management */
ensureColumn('document_types', "description TEXT NOT NULL DEFAULT ''");
ensureColumn('document_types', "requirements TEXT NOT NULL DEFAULT ''");
ensureColumn('document_types', "fee TEXT NOT NULL DEFAULT ''");
ensureColumn('document_types', 'processing_days INTEGER NOT NULL DEFAULT 1');
ensureColumn('document_types', 'is_active INTEGER NOT NULL DEFAULT 1');
/* P2 — digital queue + no-show tracking */
ensureColumn('appointments', 'queue_no INTEGER NOT NULL DEFAULT 0');
ensureColumn('appointments', "queue_state TEXT NOT NULL DEFAULT ''");
ensureColumn('appointments', 'no_show INTEGER NOT NULL DEFAULT 0');

/* ---- document request statuses: add "Under Review" --------------------
   SQLite cannot change a CHECK constraint in place, so rebuild the table
   while preserving every row (ids included). Legacy Rejected/Cancelled rows
   are copied as-is — never deleted. The API only accepts the new five. */
function migrateRequestStatuses() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='document_requests'").get();
  if (!row || /Under Review/.test(row.sql || '')) return false;

  const legacy = db.prepare(
    "SELECT status, COUNT(*) c FROM document_requests WHERE status IN ('Rejected','Cancelled') GROUP BY status"
  ).all();
  if (legacy.length) {
    console.warn('[migrate] document_requests has legacy statuses (kept as-is):', JSON.stringify(legacy));
  }

  db.exec('PRAGMA foreign_keys=OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    db.exec('DROP TABLE IF EXISTS document_requests_new');
    db.exec(`
      CREATE TABLE document_requests_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ref         TEXT NOT NULL UNIQUE,
        student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        student_name TEXT NOT NULL,
        doc_type    TEXT NOT NULL,
        quantity    INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
        purpose     TEXT NOT NULL DEFAULT '',
        pickup_date TEXT NOT NULL DEFAULT '',
        pickup_time TEXT NOT NULL DEFAULT '',
        claimed_at  TEXT NOT NULL DEFAULT '',
        completed_at TEXT NOT NULL DEFAULT '',
        notes       TEXT NOT NULL DEFAULT '',
        status      TEXT NOT NULL DEFAULT 'Pending'
                    CHECK(status IN ('Pending','Under Review','Processing','Ready for Pickup','Completed','Rejected','Cancelled')),
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
    db.exec(`
      INSERT INTO document_requests_new
        (id, ref, student_id, student_name, doc_type, quantity, purpose,
         pickup_date, pickup_time, claimed_at, completed_at, notes, status, created_at, updated_at)
      SELECT id, ref, student_id, student_name, doc_type, quantity, purpose,
             pickup_date, pickup_time, claimed_at, completed_at, notes, status, created_at, updated_at
      FROM document_requests`);
    db.exec('DROP TABLE document_requests');
    db.exec('ALTER TABLE document_requests_new RENAME TO document_requests');
    db.exec('CREATE INDEX IF NOT EXISTS idx_req_student ON document_requests(student_id)');
    db.exec('COMMIT');
    console.log('[migrate] document_requests rebuilt: Under Review supported');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) { /* already rolled back */ }
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys=ON');
  }
  return true;
}
migrateRequestStatuses();

/* ---- backfill completed_at for requests finished before the field existed.
   Manual completions use the exact REQUEST_COMPLETED log time; scanned ones
   use the QR scan time; anything else falls back to the last update.
   Runs at boot AND again after a persistence restore, because an older cloud
   snapshot carries no completed_at values. Idempotent. ---- */
function backfillCompletedAt() {
  const r = db.prepare(`
    UPDATE document_requests
    SET completed_at = COALESCE(
      (SELECT MAX(created_at) FROM activity_logs
        WHERE action='REQUEST_COMPLETED' AND details=document_requests.ref),
      CASE WHEN claimed_at != '' THEN claimed_at ELSE updated_at END
    )
    WHERE status='Completed' AND completed_at=''
  `).run();
  return r.changes || 0;
}
backfillCompletedAt();

/* ---- ensure required document types exist (safe on old + fresh DBs) ---- */
const insertDocType = db.prepare('INSERT OR IGNORE INTO document_types (name) VALUES (?)');
for (const t of ['SF9', 'SF10']) insertDocType.run(t);

/* ---- doc-type cleanup: drop retired options, rename Certification ----
   Runs at boot AND again after a persistence restore (an old snapshot may
   still carry the retired types). Idempotent. */
function migrateDocTypes() {
  const drop = db.prepare('DELETE FROM document_types WHERE name=?');
  for (const t of ['Form 137', 'Form 138', 'Good Moral Certificate', 'Transcript of Records', 'Diploma']) drop.run(t);
  db.prepare("INSERT OR IGNORE INTO document_types (name) VALUES ('Certified True Copy')").run();
  db.prepare("DELETE FROM document_types WHERE name='Certification'").run();
  db.prepare("UPDATE document_requests SET doc_type='Certified True Copy' WHERE doc_type='Certification'").run();
}
migrateDocTypes();

/* ---- P2: assign queue numbers to existing appointments (additive backfill).
   Only dates that still carry unassigned active rows are (re)numbered, in
   stable id order — idempotent, never touches cancelled/rejected rows. ---- */
{
  const pendingDates = db.prepare(
    "SELECT DISTINCT date FROM appointments WHERE queue_no=0 AND status NOT IN ('Cancelled','Rejected')"
  ).all();
  const renumber = db.prepare(
    `UPDATE appointments SET queue_no = (
       SELECT COUNT(*) FROM appointments b
       WHERE b.date = ? AND b.id <= appointments.id
         AND b.status NOT IN ('Cancelled','Rejected'))
     WHERE date = ? AND status NOT IN ('Cancelled','Rejected')`);
  for (const d of pendingDates) renumber.run(d.date, d.date);
}

/* ---- P2: starter content for the requirements manager.
   Fills ONLY pristine rows (all new columns untouched) — once. Fees are
   deliberately left blank for the registrar to set. ---- */
const DOC_CONTENT = {
  'Certificate of Enrollment': {
    description: 'Official proof that a student is currently enrolled at CDLSHS.',
    requirements: '• Submit the request through this app\n• State the purpose of the certificate\n• Claim at the counter with your QR code or school ID',
    processing_days: 1
  },
  'SF9': {
    description: "Form 9 — the learner's progress report card copy.",
    requirements: '• Indicate your grade level and section\n• State the purpose of the request',
    processing_days: 1
  },
  'SF10': {
    description: 'Form 10 — Certificate of Enrolment.',
    requirements: '• Indicate your grade level and section\n• State the purpose of the request',
    processing_days: 1
  },
  'Certified True Copy': {
    description: 'Certified true copy of a school-issued document held on file.',
    requirements: '• Present the original document to be certified\n• State the purpose\n• Valid school ID',
    processing_days: 2
  },
  'Other Registrar Documents': {
    description: 'Any other registrar document that is not listed above.',
    requirements: '• Describe the document you need\n• State the purpose of the request',
    processing_days: 2
  }
};
{
  const fill = db.prepare(
    `UPDATE document_types SET description=?, requirements=?, processing_days=?
     WHERE name=? AND description='' AND requirements='' AND fee='' AND processing_days=1`);
  for (const [name, c] of Object.entries(DOC_CONTENT)) fill.run(c.description, c.requirements, c.processing_days, name);
}

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

module.exports = { db, q, logActivity, migrateDocTypes, backfillCompletedAt };
