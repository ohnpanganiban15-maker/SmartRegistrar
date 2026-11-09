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
const { db, q, logActivity } = require('../db');
const { requireAuth, requireAdmin, validateBody } = require('../auth');

const router = express.Router();

/* "HH:MM" ↔ minutes since midnight (used when splitting a time range) */
function toMin(t) {
  const m = String(t || '').match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}
function toTime(min) {
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

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

/* admin: add slot(s) — `count` splits the time range evenly, so the registrar
   decides how many students can be served in that window (1 student per slot) */
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!validateBody(res, b, ['date', 'startTime', 'endTime'])) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });

  const count = b.count === undefined || b.count === '' || b.count === null ? 1 : Number(b.count);
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    return res.status(400).json({ error: 'Number of slots must be a whole number from 1 to 50' });
  }
  const startMin = toMin(b.startTime);
  const endMin = toMin(b.endTime);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
    return res.status(400).json({ error: 'Start and end time must be HH:MM' });
  }
  if (endMin <= startMin) return res.status(400).json({ error: 'End time must be after start time' });
  const totalMin = endMin - startMin;
  if (count > totalMin) {
    return res.status(400).json({ error: 'That time range is too short for ' + count + ' slot(s)' });
  }

  /* split [start, end) into `count` equal pieces (whole minutes) */
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const s = startMin + Math.round(i * totalMin / count);
    const e = startMin + Math.round((i + 1) * totalMin / count);
    pieces.push({ start: toTime(s), end: toTime(e) });
  }

  const clash = pieces.find(g => q.get(
    'SELECT id FROM appointment_slots WHERE date=? AND start_time=? AND end_time=?',
    b.date, g.start, g.end));
  if (clash) {
    return res.status(409).json({
      error: 'Some of those slots already exist (' + clash.start + '–' + clash.end + ' on ' + b.date + ')'
    });
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const ids = pieces.map(g => Number(q.run(
      'INSERT INTO appointment_slots (date, start_time, end_time) VALUES (?,?,?)',
      b.date, g.start, g.end).lastInsertRowid));
    db.exec('COMMIT');
    logActivity(req.user.id, req.user.name, 'ADD_SLOT',
      b.date + ' ' + pieces[0].start + '-' + pieces[pieces.length - 1].end +
      (count > 1 ? ' (' + count + ' slots)' : ''));
    res.status(201).json({
      id: ids[0], ids, count,
      message: count === 1 ? 'Slot added' : count + ' slots added'
    });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
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
