/* =====================================================
   routes/appointments.js — booking, approvals, status
   Double-booking is prevented inside a transaction:
   the slot must be open AND free of active appointments.
===================================================== */
const express = require('express');
const { db, q, logActivity } = require('../db');
const { requireAuth, validateBody } = require('../auth');

const router = express.Router();

function notify(userId, title, body, kind) {
  q.run('INSERT INTO notifications (user_id, title, body, kind) VALUES (?,?,?,?)',
    userId, title, body, kind || 'appointment');
}

/* POST /api/appointments — student books a slot */
router.post('/', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!validateBody(res, b, ['slotId', 'service'])) return;

  const user = q.get('SELECT * FROM users WHERE id=?', req.user.id);
  if (!user || user.role !== 'student' || !user.student_id) {
    return res.status(403).json({ error: 'Only student accounts can book appointments' });
  }
  const student = q.get('SELECT * FROM students WHERE id=?', user.student_id);
  if (!student) return res.status(404).json({ error: 'Student profile not found' });

  let created = null;
  db.exec('BEGIN IMMEDIATE');
  try {
    const slot = q.get('SELECT * FROM appointment_slots WHERE id=?', b.slotId);
    if (!slot) throw Object.assign(new Error('Slot not found'), { status: 404 });
    if (slot.status !== 'available') throw Object.assign(new Error('That slot is closed'), { status: 409 });
    const taken = q.get(
      "SELECT ref FROM appointments WHERE slot_id=? AND status NOT IN ('Cancelled','Rejected')", slot.id
    );
    if (taken) throw Object.assign(
      new Error('That slot was just booked by another student (double booking prevented)'),
      { status: 409 }
    );

    const r = q.run(
      `INSERT INTO appointments (ref, slot_id, student_id, student_name, service, purpose, date, start_time, end_time, status)
       VALUES ('TMP',?,?,?,?,?,?,?,?, 'Pending')`,
      slot.id, student.id, student.first_name + ' ' + student.last_name,
      String(b.service).trim(), String(b.purpose || '').trim(),
      slot.date, slot.start_time, slot.end_time
    );
    const id = Number(r.lastInsertRowid);
    const ref = 'APT-' + String(id).padStart(4, '0');
    q.run('UPDATE appointments SET ref=? WHERE id=?', ref, id);
    created = q.get('SELECT * FROM appointments WHERE id=?', id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(e.status || 500).json({ error: e.message });
  }

  notify(user.id, 'Appointment Submitted',
    'Your appointment ' + created.ref + ' (' + created.date + ' ' + created.start_time + ') is awaiting approval.');
  logActivity(req.user.id, req.user.name, 'BOOK_APPOINTMENT', created.ref);
  res.status(201).json(created);
});

/* GET /api/appointments — student: mine; admin: all (with filters) */
router.get('/', requireAuth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const { status = '', search = '', from = '', to = '' } = req.query;
  let sql = 'SELECT * FROM appointments WHERE 1=1';
  const params = [];
  if (!isAdmin) { sql += ' AND student_id = ?'; params.push(req.user.studentId); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (search) { sql += ' AND (ref LIKE ? OR student_name LIKE ? OR service LIKE ?)'; const l = '%' + search + '%'; params.push(l, l, l); }
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to) { sql += ' AND date <= ?'; params.push(to); }
  sql += ' ORDER BY date DESC, start_time DESC, id DESC';
  res.json(q.all(sql, ...params));
});

/* PUT /api/appointments/:id/status — approve/reject/complete/cancel */
router.put('/:id/status', requireAuth, (req, res) => {
  const appt = q.get('SELECT * FROM appointments WHERE id=?', req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });

  const { status, reason } = req.body || {};
  const allowed = ['Pending', 'Approved', 'Confirmed', 'Completed', 'Cancelled', 'Rejected'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  if (req.user.role !== 'admin') {
    /* students may only cancel their own upcoming pending/approved appointment */
    if (status !== 'Cancelled') return res.status(403).json({ error: 'Only the registrar can change this status' });
    if (appt.student_id !== req.user.studentId) return res.status(403).json({ error: 'Not your appointment' });
    if (!['Pending', 'Approved'].includes(appt.status)) {
      return res.status(409).json({ error: 'This appointment can no longer be cancelled' });
    }
  }

  q.run('UPDATE appointments SET status=?, updated_at=datetime(\'now\') WHERE id=?', status, appt.id);

  const studentUser = q.get('SELECT id FROM users WHERE student_id=?', appt.student_id);
  const titles = {
    Approved: 'Appointment Approved', Rejected: 'Appointment Rejected', Completed: 'Appointment Completed',
    Cancelled: 'Appointment Cancelled', Confirmed: 'Appointment Confirmed', Pending: 'Appointment Reopened'
  };
  if (studentUser) {
    notify(studentUser.id, titles[status] || 'Appointment Updated',
      appt.ref + ' for ' + appt.date + ' ' + appt.start_time + ' → ' + status + (reason ? '. Reason: ' + reason : '.'));
  }
  logActivity(req.user.id, req.user.name, 'APPOINTMENT_' + status.toUpperCase(), appt.ref);
  res.json({ message: 'Appointment marked as ' + status });
});

/* PUT /api/appointments/:id/reschedule — admin moves it to another slot */
router.put('/:id/reschedule', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const appt = q.get('SELECT * FROM appointments WHERE id=?', req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  const { slotId } = req.body || {};
  if (!slotId) return res.status(400).json({ error: 'New slot required' });

  let updated = null;
  db.exec('BEGIN IMMEDIATE');
  try {
    const slot = q.get('SELECT * FROM appointment_slots WHERE id=?', slotId);
    if (!slot) throw Object.assign(new Error('Slot not found'), { status: 404 });
    if (slot.status !== 'available') throw Object.assign(new Error('That slot is closed'), { status: 409 });
    const taken = q.get(
      "SELECT ref FROM appointments WHERE slot_id=? AND id!=? AND status NOT IN ('Cancelled','Rejected')",
      slot.id, appt.id
    );
    if (taken) throw Object.assign(new Error('That slot is already taken'), { status: 409 });

    q.run(
      `UPDATE appointments SET slot_id=?, date=?, start_time=?, end_time=?, status='Pending', updated_at=datetime('now') WHERE id=?`,
      slot.id, slot.date, slot.start_time, slot.end_time, appt.id
    );
    updated = q.get('SELECT * FROM appointments WHERE id=?', appt.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(e.status || 500).json({ error: e.message });
  }

  const studentUser = q.get('SELECT id FROM users WHERE student_id=?', appt.student_id);
  if (studentUser) {
    notify(studentUser.id, 'Appointment Rescheduled',
      appt.ref + ' moved to ' + updated.date + ' ' + updated.start_time + '. Status reset to Pending.');
  }
  logActivity(req.user.id, req.user.name, 'RESCHEDULE', appt.ref + ' → ' + updated.date + ' ' + updated.start_time);
  res.json({ message: 'Appointment rescheduled', appointment: updated });
});

module.exports = router;
