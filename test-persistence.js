/* =====================================================
   test-persistence.js — validates snapshot backup/restore
   Uses the local file storage adapter (no network) so the
   whole export → wipe → restore → re-insert cycle is proven
   against the real SQLite data layer.
   Run:  node test-persistence.js
===================================================== */
const fs = require('fs');
const path = require('path');

/* point persistence at a temp file BEFORE the modules load */
const tmp = path.join(__dirname, 'database', '.persistence-test.json');
process.env.PERSIST_FILE = tmp;
try { fs.unlinkSync(tmp); } catch (e) {}

const { purge } = require('./test-db');
const persistence = require('./server/persistence');
const { db, q } = require('./server/db');

let pass = 0, fail = 0;
const assert = (c, msg) => { if (c) { pass++; console.log('PASS:', msg); } else { fail++; console.log('FAIL:', msg); process.exitCode = 1; } };

(async () => {
  purge();

  /* seed a couple of linked rows (users ↔ students are circular FKs) */
  q.run("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)",
    'Persist', 'persist.one@cdlshs.edu.ph', 'x', 'student');
  const u1 = Number(q.run("SELECT id FROM users WHERE email='persist.one@cdlshs.edu.ph'").lastInsertRowid);
  q.run("INSERT INTO students (user_id,first_name,last_name,student_number) VALUES (?,?,?,?)",
    u1, 'Persist', 'One', 'P-0001');
  q.run("INSERT OR IGNORE INTO document_types (name) VALUES ('COG')");

  /* --- build a snapshot --- */
  const snap = persistence.snapshotJSON();
  assert(snap.v === 1 && !!snap.created_at, 'snapshot has version + timestamp');
  assert(snap.tables.users.some(u => u.email === 'persist.one@cdlshs.edu.ph'),
    'snapshot captures the user row');
  assert(snap.tables.students.some(s => s.student_number === 'P-0001'),
    'snapshot captures the student row');
  assert(snap.tables.document_types.some(d => d.name === 'COG'),
    'snapshot captures custom doc type');

  /* --- push to the (file) store --- */
  const pushed = await persistence.pushNow();
  assert(pushed === true, 'snapshot pushed to storage');
  assert(fs.existsSync(tmp), 'storage file written');

  /* --- wipe the DB (simulates a fresh Render container: NO users at all).
     purge() keeps the admin, so do a full user wipe here instead. --- */
  db.exec('PRAGMA foreign_keys=OFF; DELETE FROM users; DELETE FROM students;');
  assert(persistence.isEmpty() === true, 'DB is empty after wipe');
  assert(!q.get("SELECT id FROM users WHERE email='persist.one@cdlshs.edu.ph'"),
    'user gone before restore');

  /* --- pull + restore --- */
  const loaded = await persistence._storageLoad();
  assert(loaded && loaded.tables, 'storage returns a parsed snapshot');
  const restored = persistence.restoreFromJSON(loaded);
  assert(restored === true, 'restore applied');
  assert(persistence.isEmpty() === false, 'DB no longer empty after restore');
  assert(!!q.get("SELECT id FROM users WHERE email='persist.one@cdlshs.edu.ph'"),
    'user restored');
  assert(!!q.get("SELECT id FROM students WHERE student_number='P-0001'"),
    'student restored (FK-safe circular insert)');
  assert(!!q.get("SELECT id FROM document_types WHERE name='COG'"),
    'custom doc type restored');

  /* --- AUTOINCREMENT sequence reset: new inserts must not collide --- */
  let seqOk = true, newId = null;
  try {
    const r = q.run("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)",
      'After', 'after.restore@cdlshs.edu.ph', 'x', 'student');
    newId = Number(r.lastInsertRowid);
  } catch (e) { seqOk = false; console.log('  [seq error]', e.message); }
  assert(seqOk, 'insert after restore did not hit a PK collision');
  assert(newId !== null && newId > u1, 'new insert got a fresh id above the restored max (' + newId + ')');

  /* --- restore is idempotent / overwrites cleanly --- */
  const snap2 = persistence.snapshotJSON();
  assert(snap2.tables.users.length === snap.tables.users.length + 1,
    'second snapshot includes the post-restore insert');
  persistence.restoreFromJSON(snap2);
  assert(!!q.get("SELECT id FROM users WHERE email='after.restore@cdlshs.edu.ph'"),
    're-restore keeps latest data');

  /* --- safety guard: an empty/garbage snapshot must NOT wipe local data --- */
  const usersBefore = persistence.snapshotJSON().tables.users.length;
  const appliedEmpty = persistence.restoreFromJSON({ v: 1, created_at: 'x', tables: { users: [], students: [] } });
  assert(appliedEmpty === false, 'empty snapshot rejected (restore returns false)');
  const usersAfter = persistence.snapshotJSON().tables.users.length;
  assert(usersAfter === usersBefore && usersAfter > 0,
    'local users NOT wiped by empty snapshot (' + usersAfter + ' remain)');

  try { fs.unlinkSync(tmp); } catch (e) {}
  console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
