/* =====================================================
   persistence.js — automatic DB snapshot backup + restore
   Keeps records across Render redeploys WITHOUT touching the
   app's synchronous SQLite data layer (zero risk to routes).

   How it works:
   - snapshotJSON()  → serializes every table into one JSON blob.
   - restoreFromJSON() → wipes local tables and rebuilds from a blob.
   - On boot: if the local DB is empty (fresh Render container),
     pull the latest cloud snapshot and restore it.
   - Periodically + on shutdown: push a fresh snapshot to the cloud.

   Cloud store (pick via env, both pure fetch — no new npm deps):
   - SUPABASE_URL + SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) → Supabase
     (Postgres) via its PostgREST API, stored in a single `snapshots` row.
   - PERSIST_FILE=<path> → local JSON file (used by tests, no network).

   Every cloud call is wrapped in try/catch: if persistence is down the
   app still runs normally on the local SQLite file.
===================================================== */
const fs = require('fs');
const { db, q, migrateDocTypes } = require('./db');

/* tables in a stable order (FK checks are disabled during restore) */
const TABLES = [
  'students', 'users', 'appointment_slots', 'appointments', 'document_types',
  'document_requests', 'notifications', 'messages', 'announcements',
  'request_messages', 'activity_logs', 'otps'
];

/* ---------- snapshot build / apply ---------- */
function snapshotJSON() {
  const tables = {};
  for (const t of TABLES) {
    try { tables[t] = q.all('SELECT * FROM ' + t); } catch (e) { tables[t] = []; }
  }
  return { v: 1, created_at: new Date().toISOString(), tables };
}

/* reset AUTOINCREMENT counters so restored rows don't clash with new inserts */
function resetSequences() {
  for (const t of TABLES) {
    try {
      db.exec("DELETE FROM sqlite_sequence WHERE name='" + t + "'");
      db.exec("INSERT INTO sqlite_sequence (name, seq) SELECT '" + t +
              "', COALESCE(MAX(id),0) FROM " + t);
    } catch (e) { /* sqlite_sequence may not exist yet — ignore */ }
  }
}

function restoreFromJSON(snap) {
  /* safety: never wipe local data for a snapshot that carries no users.
     (An empty/garbage snapshot would DELETE everything and restore nothing.) */
  if (!snap || !snap.tables) return false;
  if (!Array.isArray(snap.tables.users) || snap.tables.users.length === 0) return false;
  db.exec('PRAGMA foreign_keys=OFF');
  try {
    for (const t of TABLES) db.exec('DELETE FROM ' + t);
    for (const t of TABLES) {
      const rows = snap.tables[t] || [];
      if (!rows.length) continue;
      const cols = Object.keys(rows[0]);
      const sql = 'INSERT INTO ' + t + ' (' + cols.join(',') + ') VALUES (' +
        cols.map(() => '?').join(',') + ')';
      for (const row of rows) q.run(sql, ...cols.map(c => row[c]));
    }
    resetSequences();
    /* normalize doc types in case the snapshot predates the cleanup */
    migrateDocTypes();
  } finally {
    db.exec('PRAGMA foreign_keys=ON');
  }
  return true;
}

function isEmpty() {
  try { return !(q.get('SELECT id FROM users LIMIT 1')); } catch (e) { return true; }
}

/* ---------- storage adapters (both pure fetch / fs) ---------- */
function supabaseCfg() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  return (url && key) ? { url: url.replace(/\/+$/, ''), key } : null;
}

async function storageSave(json) {
  const sb = supabaseCfg();
  if (sb) {
    /* single-row upsert (id=1) so the store stays bounded */
    const res = await fetch(sb.url + '/rest/v1/snapshots', {
      method: 'POST',
      headers: {
        'apikey': sb.key, 'Authorization': 'Bearer ' + sb.key,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ id: 1, data: json })
    });
    if (!res.ok) throw new Error('supabase save ' + res.status + ' ' + await res.text());
    return true;
  }
  const file = process.env.PERSIST_FILE;
  if (file) { fs.writeFileSync(file, JSON.stringify(json)); return true; }
  return false; /* persistence not configured */
}

async function storageLoad() {
  const sb = supabaseCfg();
  if (sb) {
    const res = await fetch(sb.url + '/rest/v1/snapshots?id=eq.1&select=data', {
      headers: { 'apikey': sb.key, 'Authorization': 'Bearer ' + sb.key }
    });
    if (!res.ok) throw new Error('supabase load ' + res.status);
    const rows = await res.json();
    return (rows && rows[0] && rows[0].data) || null;
  }
  const file = process.env.PERSIST_FILE;
  if (file && fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
  }
  return null;
}

/* ---------- public lifecycle ---------- */
async function pushNow() {
  try {
    const ok = await storageSave(snapshotJSON());
    if (ok) console.log('[persistence] snapshot pushed');
    return ok;
  } catch (e) {
    console.error('[persistence] push failed:', e.message);
    return false;
  }
}

async function restoreIfEmpty() {
  if (!isEmpty()) return false;
  try {
    const snap = await storageLoad();
    if (snap && snap.tables) {
      const ok = restoreFromJSON(snap);
      if (ok) {
        console.log('[persistence] restored snapshot (' + (snap.created_at || '?') + ')');
        return true;
      }
    }
  } catch (e) {
    console.error('[persistence] restore failed:', e.message);
  }
  return false;
}

let _timer = null;
function init() {
  const configured = !!(supabaseCfg() || process.env.PERSIST_FILE);
  /* restore in the background so startup is never blocked */
  restoreIfEmpty().then(function () {
    if (!configured) return;
    if (_timer) clearInterval(_timer);
    _timer = setInterval(pushNow, 60000); /* keep the cloud copy fresh */
    /* push on graceful shutdown so the last state is saved */
    const flush = function () { pushNow().then(function () { process.exit(0); }); };
    process.once('SIGTERM', flush);
    process.once('SIGINT', flush);
    console.log('[persistence] enabled (every 60s)');
  }).catch(function (e) { console.error('[persistence]', e.message); });
}

module.exports = {
  snapshotJSON, restoreFromJSON, isEmpty, pushNow, restoreIfEmpty, init,
  _storageSave: storageSave, _storageLoad: storageLoad
};
