/* =====================================================
   routes/notifications.js — in-app notifications
===================================================== */
const express = require('express');
const { q } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

/* GET /api/notifications — current user's notifications (newest first) */
router.get('/', requireAuth, (req, res) => {
  res.json(q.all(
    'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 50',
    req.user.id
  ));
});

/* GET /api/notifications/unread-count */
router.get('/unread-count', requireAuth, (req, res) => {
  const row = q.get('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0', req.user.id);
  res.json({ count: row.c });
});

/* PUT /api/notifications/:id/read */
router.put('/:id/read', requireAuth, (req, res) => {
  q.run('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', req.params.id, req.user.id);
  res.json({ message: 'Read' });
});

/* PUT /api/notifications/read-all */
router.put('/read-all', requireAuth, (req, res) => {
  q.run('UPDATE notifications SET is_read=1 WHERE user_id=?', req.user.id);
  res.json({ message: 'All marked as read' });
});

module.exports = router;
