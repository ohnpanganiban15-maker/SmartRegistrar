/* =====================================================
   routes/auth.js — login / register / OTP / change password
===================================================== */
const express = require('express');
const crypto = require('crypto');
const { q, logActivity } = require('../db');
const { hashPassword, verifyPassword, signToken, requireAuth, validateBody } = require('../auth');
const { sendOtpMail, isConfigured } = require('../mailer');

const router = express.Router();

const LOCK_MAX = parseInt(process.env.LOCKOUT_ATTEMPTS || '5', 10);
const LOCK_MIN = parseInt(process.env.LOCKOUT_MINUTES || '15', 10);
const OTP_TTL_MIN = parseInt(process.env.OTP_TTL_MINUTES || '10', 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);
function utcNow() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

/* ---- OTP helpers ---- */
function hashOtp(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}
function genOtp() {
  return String(crypto.randomInt(100000, 1000000));
}
function createOtp(email, purpose, payload) {
  const code = genOtp();
  const expires = new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString().slice(0, 19).replace('T', ' ');
  q.run('DELETE FROM otps WHERE email=? AND purpose=?', email, purpose);
  q.run('INSERT INTO otps (email, purpose, code_hash, payload, expires_at) VALUES (?,?,?,?,?)',
    email, purpose, hashOtp(code), JSON.stringify(payload || {}), expires);
  return code;
}
function verifyOtpRecord(email, purpose, code) {
  const rec = q.get('SELECT * FROM otps WHERE email=? AND purpose=? ORDER BY id DESC LIMIT 1', email, purpose);
  if (!rec) return { ok: false, error: 'No OTP request found. Please request a new code.' };
  if (rec.expires_at < utcNow()) {
    q.run('DELETE FROM otps WHERE id=?', rec.id);
    return { ok: false, error: 'OTP expired. Please request a new code.' };
  }
  if (rec.attempts >= OTP_MAX_ATTEMPTS) {
    q.run('DELETE FROM otps WHERE id=?', rec.id);
    return { ok: false, error: 'Too many wrong attempts. Please request a new code.' };
  }
  if (hashOtp(code) !== rec.code_hash) {
    q.run('UPDATE otps SET attempts=attempts+1 WHERE id=?', rec.id);
    const left = OTP_MAX_ATTEMPTS - (rec.attempts + 1);
    return { ok: false, error: 'Incorrect OTP.' + (left > 0 ? ' ' + left + ' attempt(s) left.' : '') };
  }
  q.run('DELETE FROM otps WHERE id=?', rec.id);
  return { ok: true, payload: JSON.parse(rec.payload || '{}') };
}

/* rate-limit: max 3 OTP sends per email per purpose per 15 min */
function canSendOtp(email, purpose) {
  const since = new Date(Date.now() - 15 * 60000).toISOString().slice(0, 19).replace('T', ' ');
  const n = q.get('SELECT COUNT(*) c FROM otps WHERE email=? AND purpose=? AND created_at>=?', email, purpose, since).c;
  return n < 3;
}

/* strong-password rules — shared with the client (public/js/util.js) */
function passwordIssue(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain both letters and numbers.';
  const low = pw.toLowerCase();
  const common = ['12345678', '123456789', '1234567890', 'password', 'password1', 'password123',
    'qwerty123', 'qwertyuiop', 'abc123456', 'abcd1234', 'iloveyou', 'admin123', 'letmein',
    'welcome1', 'welcome123', 'monkey123', 'football', 'baseball', 'princess', 'sunshine',
    'master123', 'dragon123', 'trustno1', 'starwars', 'passw0rd', 'p@ssw0rd', '00000000',
    '11111111', 'aaaaaaaa', '1q2w3e4r', 'zaq12wsx', 'asdfghjkl', 'qazwsxedc'];
  if (common.indexOf(low) !== -1) return 'That password is too common — choose a stronger one.';
  if (/^(?:0123456789|1234567890|abcdefghij|abcdefgh|qwertyuiop)/.test(low)) return 'Avoid simple sequences like 12345678 — choose a stronger one.';
  if (/^(.)\1+$/.test(pw)) return 'Avoid repeating the same character — choose a stronger one.';
  return '';
}

/* POST /api/auth/login */
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!validateBody(res, req.body, ['email', 'password'])) return;

  const user = q.get('SELECT * FROM users WHERE email = ?', String(email).toLowerCase().trim());
  if (user && user.locked_until && user.locked_until > utcNow()) {
    const mins = Math.max(1, Math.ceil((Date.parse(user.locked_until.replace(' ', 'T') + 'Z') - Date.now()) / 60000));
    return res.status(429).json({ error: 'Too many failed attempts. Account locked, try again in about ' + mins + ' minute(s).' });
  }
  if (!user || !verifyPassword(password, user.password_hash)) {
    if (user) {
      const attempts = (user.failed_attempts || 0) + 1;
      const locked = attempts >= LOCK_MAX
        ? new Date(Date.now() + LOCK_MIN * 60000).toISOString().slice(0, 19).replace('T', ' ')
        : '';
      q.run('UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?', attempts, locked, user.id);
      if (attempts >= LOCK_MAX) {
        logActivity(user.id, user.name, 'LOGIN_LOCKED', user.email);
        return res.status(429).json({ error: 'Too many failed attempts. Account locked for ' + LOCK_MIN + ' minutes.' });
      }
    }
    return res.status(401).json({ error: 'Incorrect email or password' });
  }
  if (user.status !== 'active') {
    return res.status(403).json({ error: 'This account has been disabled. Contact the registrar.' });
  }
  if (user.failed_attempts || user.locked_until) {
    q.run("UPDATE users SET failed_attempts=0, locked_until='' WHERE id=?", user.id);
  }

  logActivity(user.id, user.name, 'LOGIN', user.email);
  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role, studentId: user.student_id }
  });
});

/* ============================================================
   REGISTRATION WITH OTP
   Step 1: POST /api/auth/register          → sends OTP
   Step 2: POST /api/auth/register/verify-otp → creates account
============================================================ */

/* POST /api/auth/register — validate + send OTP (no account yet) */
router.post('/register', async (req, res) => {
  const b = req.body || {};
  if (!validateBody(res, b, ['firstName', 'lastName', 'email', 'password', 'studentNumber'])) return;
  const weak = passwordIssue(b.password);
  if (weak) return res.status(400).json({ error: weak });
  const email = String(b.email).toLowerCase().trim();
  if (q.get('SELECT id FROM users WHERE email = ?', email)) {
    return res.status(409).json({ error: 'This Gmail is already registered — 1 Gmail can only have 1 account.' });
  }
  if (q.get('SELECT id FROM students WHERE student_number = ?', String(b.studentNumber).trim())) {
    return res.status(409).json({ error: 'This LRN is already registered' });
  }
  if (!canSendOtp(email, 'register')) {
    return res.status(429).json({ error: 'Too many OTP requests. Please wait 15 minutes.' });
  }

  const payload = {
    studentNumber: String(b.studentNumber).trim(),
    firstName: String(b.firstName).trim(),
    lastName: String(b.lastName).trim(),
    middleName: String(b.middleName || '').trim(),
    gradeLevel: String(b.gradeLevel || '').trim(),
    strand: String(b.strand || '').trim(),
    contact: String(b.contact || '').trim(),
    password: String(b.password)
  };
  const code = createOtp(email, 'register', payload);
  try {
    const info = await sendOtpMail(email, code, 'register');
    const body = { message: 'OTP sent to ' + email + '. Enter the 6-digit code to finish.', email };
    if (info && info.dev) body.devOtp = code;
    res.status(201).json(body);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* POST /api/auth/register/verify-otp — verify + create account */
router.post('/register/verify-otp', (req, res) => {
  const b = req.body || {};
  if (!validateBody(res, b, ['email', 'otp'])) return;
  const email = String(b.email).toLowerCase().trim();
  const result = verifyOtpRecord(email, 'register', String(b.otp).trim());
  if (!result.ok) return res.status(400).json({ error: result.error });

  const p = result.payload;
  if (q.get('SELECT id FROM users WHERE email = ?', email)) {
    return res.status(409).json({ error: 'This Gmail is already registered — 1 Gmail can only have 1 account.' });
  }
  if (q.get('SELECT id FROM students WHERE student_number = ?', p.studentNumber)) {
    return res.status(409).json({ error: 'This LRN is already registered' });
  }

  const r1 = q.run(
    'INSERT INTO students (student_number, first_name, middle_name, last_name, grade_level, strand, contact, email) VALUES (?,?,?,?,?,?,?,?)',
    p.studentNumber, p.firstName, p.middleName, p.lastName, p.gradeLevel, p.strand, p.contact, email
  );
  const studentId = Number(r1.lastInsertRowid);
  const r2 = q.run(
    'INSERT INTO users (student_id, name, email, password_hash, role) VALUES (?,?,?,?,?)',
    studentId, (p.firstName + ' ' + p.lastName).trim(), email, hashPassword(p.password), 'student'
  );
  logActivity(Number(r2.lastInsertRowid), p.firstName + ' ' + p.lastName, 'REGISTER', email + ' (OTP verified)');
  res.status(201).json({ message: 'Account created. You can now log in.' });
});

/* ============================================================
   CHANGE PASSWORD WITH OTP
   Step 1: POST /api/auth/change-password/request-otp
   Step 2: POST /api/auth/change-password/verify-otp
============================================================ */

/* Step 1: verify current password + send OTP */
router.post('/change-password/request-otp', requireAuth, async (req, res) => {
  const b = req.body || {};
  if (!validateBody(res, b, ['currentPassword', 'newPassword'])) return;
  const user = q.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!verifyPassword(b.currentPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  const weakNew = passwordIssue(b.newPassword);
  if (weakNew) return res.status(400).json({ error: weakNew });
  if (String(b.newPassword) === String(b.currentPassword)) {
    return res.status(400).json({ error: 'New password must be different from the current one' });
  }
  if (!canSendOtp(user.email, 'change_password')) {
    return res.status(429).json({ error: 'Too many OTP requests. Please wait 15 minutes.' });
  }

  const code = createOtp(user.email, 'change_password', { newPassword: String(b.newPassword) });
  try {
    const info = await sendOtpMail(user.email, code, 'change_password');
    const body = { message: 'OTP sent to ' + user.email + '. Enter the code to confirm.', email: user.email };
    if (info && info.dev) body.devOtp = code;
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* Step 2: verify OTP + change password */
router.post('/change-password/verify-otp', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!validateBody(res, b, ['otp'])) return;
  const user = q.get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const result = verifyOtpRecord(user.email, 'change_password', String(b.otp).trim());
  if (!result.ok) return res.status(400).json({ error: result.error });

  const tv = (user.token_version || 0) + 1;
  q.run("UPDATE users SET password_hash=?, token_version=?, failed_attempts=0, locked_until='' WHERE id=?",
    hashPassword(result.payload.newPassword), tv, user.id);
  logActivity(user.id, user.name, 'CHANGE_PASSWORD', user.email + ' (OTP verified)');
  res.json({ message: 'Password changed. Other sessions were signed out.', token: signToken({ ...user, token_version: tv }) });
});

/* GET /api/auth/me */
router.get('/me', requireAuth, (req, res) => {
  const user = q.get('SELECT id, name, email, role, student_id, status FROM users WHERE id = ?', req.user.id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  const out = { id: user.id, name: user.name, email: user.email, role: user.role, studentId: user.student_id };
  if (user.student_id) {
    out.student = q.get(
      'SELECT id, student_number, first_name, middle_name, last_name, grade_level, strand, contact, email, status, profile_photo FROM students WHERE id = ?',
      user.student_id
    );
  }
  res.json(out);
});

module.exports = router;
