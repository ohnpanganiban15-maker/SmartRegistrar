/* =====================================================
   version.js — identifies the running build
   Powers the in-app update notifier:
   - GET /api/app/version tells clients which build is live
   - announceIfChanged() posts an announcement whenever the
     server boots a different build than the last one it saw
===================================================== */
const { execSync } = require('child_process');
const path = require('path');
const { q, logActivity } = require('./db');

function computeVersion() {
  /* Render sets this to the exact commit it deployed */
  if (process.env.RENDER_GIT_COMMIT) return String(process.env.RENDER_GIT_COMMIT).slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
  } catch (e) { return 'dev'; }
}

const version = computeVersion();
const bootedAt = new Date().toISOString();

/* Post an announcement when the booted build differs from the stored one.
   (Called after the persistence restore settles so it sees the final DB.)
   First boot just records the version — nothing to announce yet. */
function announceIfChanged() {
  try {
    const row = q.get("SELECT value FROM app_meta WHERE key='app_version'");
    if (!row) {
      q.run("INSERT INTO app_meta (key, value) VALUES ('app_version', ?)", version);
      return false;
    }
    if (row.value === version) return false;
    q.run("UPDATE app_meta SET value=? WHERE key='app_version'", version);
    q.run('INSERT INTO announcements (title, body) VALUES (?,?)',
      'App Updated \u{1F680}',
      'Version ' + version + ' is now live - new features and improvements. ' +
      'Refresh the page (or reopen the app) to get the latest version.');
    logActivity(null, 'System', 'APP_UPDATED', 'version ' + row.value + ' -> ' + version);
    console.log('[version] app updated: ' + row.value + ' -> ' + version);
    return true;
  } catch (e) {
    console.error('[version]', e.message);
    return false;
  }
}

module.exports = { version, bootedAt, announceIfChanged };
