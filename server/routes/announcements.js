/* =====================================================
   routes/announcements.js — registrar announcements
===================================================== */
const express = require('express');
const { q, logActivity } = require('../db');
const { requireAuth, requireAdmin, validateBody } = require('../auth');

const router = express.Router();

/* GET /api/announcements — everyone logged in can read */
router.get('/', requireAuth, (req, res) => {
  res.json(q.all('SELECT * FROM announcements ORDER BY created_at DESC, id DESC'));
});

/* POST /api/announcements — admin */
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!validateBody(res, b, ['title', 'body'])) return;
  const r = q.run('INSERT INTO announcements (title, body) VALUES (?,?)',
    String(b.title).trim(), String(b.body).trim());
  logActivity(req.user.id, req.user.name, 'ADD_ANNOUNCEMENT', String(b.title).trim());
  res.status(201).json({ id: Number(r.lastInsertRowid), message: 'Announcement posted' });
});

/* DELETE /api/announcements/:id — admin */
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const a = q.get('SELECT * FROM announcements WHERE id=?', req.params.id);
  if (!a) return res.status(404).json({ error: 'Announcement not found' });
  q.run('DELETE FROM announcements WHERE id=?', a.id);
  logActivity(req.user.id, req.user.name, 'DELETE_ANNOUNCEMENT', a.title);
  res.json({ message: 'Announcement deleted' });
});

module.exports = router;
