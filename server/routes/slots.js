/* =====================================================
   routes/slots.js — appointment availability
   GET  /api/slots          → open slots for booking
   GET  /api/slots/all      → admin: every slot + booking counts
   POST /api/slots          → admin: add slot(s)
   PUT  /api/slots/:id      → admin: edit slot / close / reopen
   DELETE /api/slots/:id    → admin: delete unbooked slot
   POST /api/slots/close-date → admin: close/reopen a whole day
===================================================== */
const express = require('express');
const { q, logActivity } = require('../db');
const { requireAuth, requireAdmin, validateBody } = require('../auth');

const router = express.Router();

/* open slots (students) — only future, open, not fully booked */
router.get('/', requireAuth, (req, res) => {
  const rows = q.all(
    `SELECT s.*,
       (SELECT COUNT(*) FROM appointments a WHERE a.slot_id = s.id AND a.status NOT IN ('Cancelled','Rejected')) AS booked
     FROM appointment_slots s
     WHERE s.status = 'available' AND s.date >= date('now','localtime')
     ORDER BY s.date, s.start_time`
  );
  res.json(rows.map(r => ({ ...r, is_booked: r.booked > 0, booked: Number(r.booked) })));
});

/* admin: all slots including past/closed */
router.get('/all', requireAuth, requireAdmin, (req, res) => {
  const rows = q.all(
    `SELECT s.*,
       (SELECT COUNT(*) FROM appointments a WHERE a.slot_id = s.id AND a.status NOT IN ('Cancelled','Rejected')) AS booked
     FROM appointment_slots s ORDER BY s.date, s.start_time`
  );
  res.json(rows.map(r => ({ ...r, is_booked: r.booked > 0, booked: Number(r.booked) })));
});

/* admin: distinct upcoming dates (for the date picker) */
router.get('/dates', requireAuth, (req, res) => {
  const rows = q.all(
    `SELECT DISTINCT date FROM appointment_slots
     WHERE status='available' AND date >= date('now','localtime') ORDER BY date`
  );
  res.json(rows.map(r => r.date));
});

/* admin: add a slot */
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!validateBody(res, b, ['date', 'startTime', 'endTime'])) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
  if (q.get('SELECT id FROM appointment_slots WHERE date=? AND start_time=? AND end_time=?',
    b.date, b.startTime, b.endTime)) {
    return res.status(409).json({ error: 'That slot already exists' });
  }
  const r = q.run('INSERT INTO appointment_slots (date, start_time, end_time) VALUES (?,?,?)',
    b.date, b.startTime, b.endTime);
  logActivity(req.user.id, req.user.name, 'ADD_SLOT', b.date + ' ' + b.startTime + '-' + b.endTime);
  res.status(201).json({ id: Number(r.lastInsertRowid), message: 'Slot added' });
});

/* admin: edit / close / reopen */
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const slot = q.get('SELECT * FROM appointment_slots WHERE id=?', req.params.id);
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  const b = req.body || {};

  const date = b.date ?? slot.date;
  const startTime = b.startTime ?? slot.start_time;
  const endTime = b.endTime ?? slot.end_time;
  let status = b.status ?? slot.status;
  if (status !== 'available' && status !== 'closed') status = slot.status;

  /* moving a booked slot is not allowed */
  const booked = q.get(
    "SELECT COUNT(*) c FROM appointments WHERE slot_id=? AND status NOT IN ('Cancelled','Rejected')", slot.id
  ).c;
  if (booked > 0 && (date !== slot.date || startTime !== slot.start_time || endTime !== slot.end_time)) {
    return res.status(409).json({ error: 'Cannot move a slot that already has bookings. Cancel those first.' });
  }
  const clash = q.get(
    'SELECT id FROM appointment_slots WHERE date=? AND start_time=? AND end_time=? AND id != ?',
    date, startTime, endTime, slot.id
  );
  if (clash) return res.status(409).json({ error: 'Another slot already uses that time' });

  q.run('UPDATE appointment_slots SET date=?, start_time=?, end_time=?, status=? WHERE id=?',
    date, startTime, endTime, status, slot.id);
  logActivity(req.user.id, req.user.name, 'EDIT_SLOT', '#' + slot.id + ' → ' + date + ' ' + startTime);
  res.json({ message: 'Slot updated' });
});

/* admin: delete (only if no bookings) */
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const slot = q.get('SELECT * FROM appointment_slots WHERE id=?', req.params.id);
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  const booked = q.get(
    "SELECT COUNT(*) c FROM appointments WHERE slot_id=? AND status NOT IN ('Cancelled','Rejected')", slot.id
  ).c;
  if (booked > 0) return res.status(409).json({ error: 'Slot is booked — cannot delete' });
  q.run('DELETE FROM appointment_slots WHERE id=?', slot.id);
  logActivity(req.user.id, req.user.name, 'DELETE_SLOT', '#' + slot.id);
  res.json({ message: 'Slot deleted' });
});

/* admin: close or reopen an entire date */
router.post('/close-date', requireAuth, requireAdmin, (req, res) => {
  const { date, status } = req.body || {};
  if (!validateBody(res, req.body, ['date'])) return;
  const mode = status === 'closed' ? 'closed' : 'available';
  const r = q.run('UPDATE appointment_slots SET status=? WHERE date=?', mode, date);
  if (r.changes === 0) return res.status(404).json({ error: 'No slots found on that date' });
  logActivity(req.user.id, req.user.name, mode === 'closed' ? 'CLOSE_DATE' : 'REOPEN_DATE', date);
  res.json({ message: (mode === 'closed' ? 'Closed ' : 'Reopened ') + r.changes + ' slot(s) on ' + date });
});

module.exports = router;
