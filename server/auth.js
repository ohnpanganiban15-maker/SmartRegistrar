/* =====================================================
   auth.js — password hashing (bcrypt) + JWT tokens +
   Express middleware for role-based authorization
===================================================== */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');
const { q } = require('./db');

function hashPassword(plain) {
  return bcrypt.hashSync(String(plain), 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(String(plain), hash);
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email, studentId: user.student_id, tv: user.token_version || 0 },
    config.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/* Reads Authorization: Bearer <token>, attaches req.user */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    req.user = jwt.verify(token, config.JWT_SECRET);
    const row = q.get('SELECT token_version FROM users WHERE id=?', req.user.id);
    if (!row || (row.token_version || 0) !== (req.user.tv || 0)) {
      return res.status(401).json({ error: 'Session expired, please log in again' });
    }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

/* Admin-only routes */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/* Validates that required fields exist; throws 400 otherwise */
function validateBody(res, body, fields) {
  const missing = fields.filter(f => {
    const v = body && body[f];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
  if (missing.length) {
    res.status(400).json({ error: 'Missing required field(s): ' + missing.join(', ') });
    return false;
  }
  return true;
}

module.exports = { hashPassword, verifyPassword, signToken, requireAuth, requireAdmin, validateBody };
