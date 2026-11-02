/* =====================================================
   reset-admin.js — one-time admin password reset
   -----------------------------------------------------
   Guarded by the RESET_ADMIN_PASSWORD env var so it can
   never fire by accident: unset / empty = no-op.

   MUST run AFTER the Supabase restore (index.js calls it
   from persistence.init's onReady). Running it earlier is
   useless — restoreFromJSON() wipes the users table and
   would put the old hash straight back.

   It also clears failed_attempts / locked_until, so a
   lockout caused by mistyped attempts is lifted.
===================================================== */
const { q } = require('./db');
const { hashPassword } = require('./auth');

const ADMIN_EMAIL = 'admin@cdlshs.edu.ph';

function resetAdminIfRequested() {
  const pw = process.env.RESET_ADMIN_PASSWORD;
  if (!pw) return false;                    /* not requested → no-op */

  const user = q.get('SELECT id FROM users WHERE email = ?', ADMIN_EMAIL);
  if (user) {
    q.run(
      'UPDATE users SET password_hash=?, failed_attempts=0, locked_until=? WHERE id=?',
      hashPassword(pw), '', user.id
    );
    console.log('[reset-admin] password reset for ' + ADMIN_EMAIL + ' (unlocked)');
  } else {
    q.run(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
      'Registrar Admin', ADMIN_EMAIL, hashPassword(pw), 'admin'
    );
    console.log('[reset-admin] admin account created: ' + ADMIN_EMAIL);
  }
  return true;
}

module.exports = { resetAdminIfRequested, ADMIN_EMAIL };
