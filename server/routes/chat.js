/* =====================================================
   routes/chat.js — Customer Service (messages)
===================================================== */
const express = require('express');
const { q, logActivity } = require('../db');
const { requireAuth, requireAdmin, validateBody } = require('../auth');

const router = express.Router();

/* GET /api/chat — student: own; admin: all */
router.get('/', requireAuth, (req, res) => {
  if (req.user.role === 'admin') {
    return res.json(q.all('SELECT * FROM messages ORDER BY created_at DESC'));
  }
  res.json(q.all('SELECT * FROM messages WHERE user_id=? ORDER BY created_at DESC', req.user.id));
});

/* POST /api/chat — student sends an inquiry */
router.post('/', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!validateBody(res, b, ['subject', 'body'])) return;
  const user = q.get('SELECT name FROM users WHERE id=?', req.user.id);
  const r = q.run('INSERT INTO messages (user_id, student_name, subject, body) VALUES (?,?,?,?)',
    req.user.id, user.name, String(b.subject).trim(), String(b.body).trim());
  logActivity(req.user.id, req.user.name, 'SEND_INQUIRY', String(b.subject).trim());
  res.status(201).json(q.get('SELECT * FROM messages WHERE id=?', Number(r.lastInsertRowid)));
});

/* PUT /api/chat/:id/reply — admin answers */
router.put('/:id/reply', requireAuth, requireAdmin, (req, res) => {
  const msg = q.get('SELECT * FROM messages WHERE id=?', req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  const { reply } = req.body || {};
  if (!validateBody(res, req.body, ['reply'])) return;
  q.run(`UPDATE messages SET admin_reply=?, status='Resolved', replied_at=datetime('now') WHERE id=?`,
    String(reply).trim(), msg.id);
  q.run('INSERT INTO notifications (user_id, title, body, kind) VALUES (?,?,?,?)',
    msg.user_id, 'Registrar Replied', 'The registrar replied to your message: "' + msg.subject + '"', 'chat');
  logActivity(req.user.id, req.user.name, 'REPLY_INQUIRY', '#' + msg.id);
  res.json({ message: 'Reply sent and message resolved' });
});

/* PUT /api/chat/:id/resolve — admin marks resolved without reply */
router.put('/:id/resolve', requireAuth, requireAdmin, (req, res) => {
  const msg = q.get('SELECT * FROM messages WHERE id=?', req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  q.run(`UPDATE messages SET status='Resolved', replied_at=COALESCE(replied_at, datetime('now')) WHERE id=?`, msg.id);
  logActivity(req.user.id, req.user.name, 'RESOLVE_INQUIRY', '#' + msg.id);
  res.json({ message: 'Marked as resolved' });
});

module.exports = router;
