/* Live-safe SQLite backup (VACUUM INTO) — keeps the newest 14 snapshots.
   Runs daily at 2:15 AM via cron (installed by deploy/install.sh).
   Usage: node scripts/backup.js                              */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const proj = path.join(__dirname, '..');
const dbPath = path.resolve(proj, process.env.DB_PATH || './database/smart-registrar.db');
const dir = path.join(proj, 'database', 'backups');
fs.mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = path.join(dir, `smart-registrar-${stamp}.db`);

const db = new DatabaseSync(dbPath);
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
db.close();

const files = fs.readdirSync(dir)
  .filter(f => /^smart-registrar-.*\.db$/.test(f))
  .sort();
for (const f of files.slice(0, Math.max(0, files.length - 14))) {
  fs.unlinkSync(path.join(dir, f));
}
console.log(new Date().toISOString(), 'backup ->', out);
