/* =====================================================
   routes/messages.js — per-request chat (messenger)
   Student and registrar talk inside a document request.
   History stays forever (survives status changes).
===================================================== */
const express = require('express');
const { q, logActivity } = require('../db');
const { requireAuth, validateBody } = require('../auth');

const router = express.Router();

/* in-memory "who is typing" markers — ephemeral, per request + role.
   Not persisted (typing state is transient); refreshed by client heartbeats. */
const typing = {};
const TYPING_TTL = 8000; /* a marker stays fresh for 8s */
function setTyping(requestId, role) {
  typing[requestId] = typing[requestId] || {};
  typing[requestId][role] = Date.now();
}
function peerTyping(requestId, role) {
  const t = typing[requestId] && typing[requestId][role];
  return !!t && (Date.now() - t) < TYPING_TTL;
}

function loadRequest(id) {
  const n = parseInt(id, 10);
  if (!Number.isFinite(n)) return null;
  return q.get('SELECT * FROM document_requests WHERE id=?', n) || null;
}

function canAccess(user, dr) {
  if (!dr) return false;
  if (user.role === 'admin') return true;
  return !!user.studentId && dr.student_id === user.studentId;
}

function notify(userId, title, body, kind) {
  q.run('INSERT INTO notifications (user_id, title, body, kind) VALUES (?,?,?,?)',
    userId, title, body, kind || 'chat');
}

function shorten(text, n) {
  return text.length > n ? text.slice(0, n) + '…' : text;
}

/* GET /api/messages/unread-count — badge + messenger popup trigger */
router.get('/unread-count', requireAuth, (req, res) => {
  let row;
  if (req.user.role === 'admin') {
    row = q.get(
      `SELECT COUNT(*) c, MAX(id) mid FROM request_messages
       WHERE sender_role='student' AND read_admin=0`);
  } else {
    row = q.get(
      `SELECT COUNT(*) c, MAX(m.id) mid FROM request_messages m
       JOIN document_requests r ON r.id = m.request_id
       WHERE m.sender_role='admin' AND m.read_student=0 AND r.student_id=?`,
      req.user.studentId);
  }
  let latest_request_id = null;
  if (row && row.mid) {
    const m = q.get('SELECT request_id FROM request_messages WHERE id=?', row.mid);
    if (m) latest_request_id = m.request_id;
  }
  res.json({ count: (row && row.c) || 0, latest_request_id });
});

/* GET /api/messages/:requestId — full thread history (+ request meta) */
router.get('/:requestId', requireAuth, (req, res) => {
  const dr = loadRequest(req.params.requestId);
  if (!dr) return res.status(404).json({ error: 'Request not found' });
  if (!canAccess(req.user, dr)) return res.status(403).json({ error: 'Not your request' });
  const messages = q.all(
    'SELECT * FROM request_messages WHERE request_id=? ORDER BY id ASC', dr.id);
  const myRole = req.user.role === 'admin' ? 'admin' : 'student';
  const otherRole = myRole === 'admin' ? 'student' : 'admin';
  res.json({
    request: {
      id: dr.id, ref: dr.ref, student_name: dr.student_name,
      doc_type: dr.doc_type, status: dr.status
    },
    messages,
    peer_typing: peerTyping(dr.id, otherRole)
  });
});

/* POST /api/messages/:requestId — send a message in the thread */
router.post('/:requestId', requireAuth, (req, res) => {
  const dr = loadRequest(req.params.requestId);
  if (!dr) return res.status(404).json({ error: 'Request not found' });
  if (!canAccess(req.user, dr)) return res.status(403).json({ error: 'Not your request' });
  const b = req.body || {};
  if (!validateBody(res, b, ['text'])) return;
  const body = String(b.text).trim().slice(0, 1000);
  if (!body) return res.status(400).json({ error: 'Message is empty' });

  const role = req.user.role === 'admin' ? 'admin' : 'student';
  const r = q.run(
    `INSERT INTO request_messages
       (request_id, sender_role, sender_id, sender_name, body, read_student, read_admin)
     VALUES (?,?,?,?,?,?,?)`,
    dr.id, role, req.user.id, req.user.name || '', body,
    role === 'admin' ? 0 : 1,   /* the other side has not read it yet */
    role === 'student' ? 0 : 1
  );
  const created = q.get('SELECT * FROM request_messages WHERE id=?', Number(r.lastInsertRowid));

  const preview = shorten(body, 80);
  if (role === 'admin') {
    const stuUser = q.get('SELECT id FROM users WHERE student_id=?', dr.student_id);
    if (stuUser) notify(stuUser.id, 'Message from the Registrar', dr.ref + ': ' + preview, 'chat');
  } else {
    q.all("SELECT id FROM users WHERE role='admin'").forEach(a =>
      notify(a.id, 'New Chat Message', dr.student_name + ' replied about ' + dr.ref + ': ' + preview, 'chat'));
  }
  logActivity(req.user.id, req.user.name, 'CHAT_MESSAGE', dr.ref);
  res.status(201).json(created);
});

/* POST /api/messages/:requestId/read — mark the thread read for the current role */
router.post('/:requestId/read', requireAuth, (req, res) => {
  const dr = loadRequest(req.params.requestId);
  if (!dr) return res.status(404).json({ error: 'Request not found' });
  if (!canAccess(req.user, dr)) return res.status(403).json({ error: 'Not your request' });
  if (req.user.role === 'admin') {
    q.run('UPDATE request_messages SET read_admin=1 WHERE request_id=? AND sender_role=?', dr.id, 'student');
  } else {
    q.run('UPDATE request_messages SET read_student=1 WHERE request_id=? AND sender_role=?', dr.id, 'admin');
  }
  res.json({ ok: true });
});

/* POST /api/messages/:requestId/typing — heartbeat so the peer can show "typing…" */
router.post('/:requestId/typing', requireAuth, (req, res) => {
  const dr = loadRequest(req.params.requestId);
  if (!dr) return res.status(404).json({ error: 'Request not found' });
  if (!canAccess(req.user, dr)) return res.status(403).json({ error: 'Not your request' });
  setTyping(dr.id, req.user.role === 'admin' ? 'admin' : 'student');
  res.json({ ok: true });
});

module.exports = router;
