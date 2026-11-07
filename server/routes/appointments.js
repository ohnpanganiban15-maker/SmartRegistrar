/* =====================================================
   routes/appointments.js — booking, approvals, status
   Double-booking is prevented inside a transaction:
   the slot must be open AND free of active appointments.
===================================================== */
const express = require('express');
const { db, q, logActivity } = require('../db');
const { requireAuth, validateBody } = require('../auth');
const { sendStatusMail } = require('../mailer');

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

    /* digital queue: every booking joins that day's queue in order */
    const nextQ = q.get(
      `SELECT COALESCE(MAX(queue_no),0) n FROM appointments
       WHERE date=? AND status NOT IN ('Cancelled','Rejected')`, slot.date).n;
    const r = q.run(
      `INSERT INTO appointments (ref, slot_id, student_id, student_name, service, purpose, date, start_time, end_time, status, queue_no)
       VALUES ('TMP',?,?,?,?,?,?,?,?, 'Pending', ?)`,
      slot.id, student.id, student.first_name + ' ' + student.last_name,
      String(b.service).trim(), String(b.purpose || '').trim(),
      slot.date, slot.start_time, slot.end_time, Number(nextQ) + 1
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
    'Your appointment ' + created.ref + ' (' + created.date + ' ' + created.start_time + ') is awaiting approval.' +
    (created.queue_no ? ' You are #' + created.queue_no + " in that day's queue." : ''));
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

/* GET /api/appointments/queue?date=YYYY-MM-DD — admin: digital queue board.
   Returns the day's line-up split into waiting / now-serving / done. */
router.get('/queue', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const d = String(req.query.date || '').trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date().toISOString().slice(0, 10);
  const rows = q.all(
    `SELECT id, ref, student_name, service, start_time, end_time, status,
            queue_no, queue_state, no_show, created_at
     FROM appointments
     WHERE date=? AND status NOT IN ('Cancelled','Rejected')
     ORDER BY queue_no, id`, date);
  res.json({
    date,
    rows,
    waiting: rows.filter(r => !r.queue_state).length,
    serving: rows.find(r => r.queue_state === 'serving') || null,
    served: rows.filter(r => r.queue_state === 'served').length
  });
});

/* POST /api/appointments/approve-all — admin: one-tap bulk approval */
router.post('/approve-all', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const pending = q.all("SELECT * FROM appointments WHERE status='Pending'");
  for (const a of pending) {
    q.run("UPDATE appointments SET status='Approved', updated_at=datetime('now') WHERE id=?", a.id);
    const studentUser = q.get('SELECT id FROM users WHERE student_id=?', a.student_id);
    if (studentUser) {
      notify(studentUser.id, 'Appointment Approved',
        a.ref + ' (' + a.date + ' ' + a.start_time + ') is approved' +
        (a.queue_no ? " — you are #" + a.queue_no + " in that day's queue." : '.'));
    }
  }
  if (pending.length) logActivity(req.user.id, req.user.name, 'BULK_APPROVE', pending.length + ' appointment(s)');
  res.json({ approved: pending.length });
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

  const studentUser = q.get('SELECT id, name, email FROM users WHERE student_id=?', appt.student_id);
  const titles = {
    Approved: 'Appointment Approved', Rejected: 'Appointment Rejected', Completed: 'Appointment Completed',
    Cancelled: 'Appointment Cancelled', Confirmed: 'Appointment Confirmed', Pending: 'Appointment Reopened'
  };
  if (studentUser) {
    notify(studentUser.id, titles[status] || 'Appointment Updated',
      appt.ref + ' for ' + appt.date + ' ' + appt.start_time + ' → ' + status + (reason ? '. Reason: ' + reason : '.'));

    const subjects = {
      Approved: 'Your appointment is approved',
      Confirmed: 'Your appointment is confirmed',
      Completed: 'Your appointment is completed',
      Cancelled: 'Your appointment was cancelled',
      Rejected: 'Your appointment was rejected',
      Pending: 'Your appointment was reopened'
    };
    if (subjects[status]) {
      const lines = [
        'Hi ' + (studentUser.name || 'student') + ',',
        '',
        'Your appointment ' + appt.ref + ' (' + appt.service + ') on ' +
          appt.date + ' at ' + appt.start_time + ' is now: ' + status + '.'
      ];
      if (reason) lines.push('Reason: ' + reason);
      if (status === 'Approved' || status === 'Confirmed') {
        lines.push('Please arrive a few minutes early and bring a valid ID.');
      }
      lines.push('', 'You can also view this appointment inside the Smart Registrar app.');
      sendStatusMail(studentUser.email,
        'Smart Registrar — ' + subjects[status], lines).catch(() => {});
    }
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

    /* moving to another day re-joins that day's queue at the end */
    const nextQ = q.get(
      `SELECT COALESCE(MAX(queue_no),0) n FROM appointments
       WHERE date=? AND id!=? AND status NOT IN ('Cancelled','Rejected')`, slot.date, appt.id).n;
    q.run(
      `UPDATE appointments SET slot_id=?, date=?, start_time=?, end_time=?, status='Pending',
       queue_no=?, queue_state='', updated_at=datetime('now') WHERE id=?`,
      slot.id, slot.date, slot.start_time, slot.end_time, Number(nextQ) + 1, appt.id
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

/* ---------- digital queue actions (registrar) ---------- */

/* POST /api/appointments/:id/call — "Now serving": call the next student */
router.post('/:id/call', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const a = q.get('SELECT * FROM appointments WHERE id=?', req.params.id);
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  if (['Cancelled', 'Rejected', 'Completed'].includes(a.status)) {
    return res.status(409).json({ error: 'This appointment can no longer be called' });
  }
  q.run("UPDATE appointments SET queue_state='serving', updated_at=datetime('now') WHERE id=?", a.id);
  logActivity(req.user.id, req.user.name, 'QUEUE_CALL', a.ref + (a.queue_no ? ' #' + a.queue_no : ''));
  const studentUser = q.get('SELECT id FROM users WHERE student_id=?', a.student_id);
  if (studentUser) notify(studentUser.id, 'Now Serving', a.ref + ' — please proceed to the registrar counter.');
  res.json(q.get('SELECT * FROM appointments WHERE id=?', a.id));
});

/* POST /api/appointments/:id/served — student attended: queue done + completed */
router.post('/:id/served', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const a = q.get('SELECT * FROM appointments WHERE id=?', req.params.id);
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  if (['Cancelled', 'Rejected'].includes(a.status)) {
    return res.status(409).json({ error: 'This appointment cannot be marked as served' });
  }
  q.run(`UPDATE appointments SET queue_state='served', status='Completed',
         updated_at=datetime('now') WHERE id=?`, a.id);
  logActivity(req.user.id, req.user.name, 'QUEUE_SERVED', a.ref);
  const studentUser = q.get('SELECT id FROM users WHERE student_id=?', a.student_id);
  if (studentUser) notify(studentUser.id, 'Appointment Completed', a.ref + ' — thank you!');
  res.json(q.get('SELECT * FROM appointments WHERE id=?', a.id));
});

/* POST /api/appointments/:id/noshow — student did not arrive */
router.post('/:id/noshow', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const a = q.get('SELECT * FROM appointments WHERE id=?', req.params.id);
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  if (['Cancelled', 'Rejected', 'Completed'].includes(a.status)) {
    return res.status(409).json({ error: 'This appointment is already closed' });
  }
  q.run(`UPDATE appointments SET no_show=1, queue_state='', status='Cancelled',
         updated_at=datetime('now') WHERE id=?`, a.id);
  logActivity(req.user.id, req.user.name, 'APPOINTMENT_NO_SHOW', a.ref);
  const studentUser = q.get('SELECT id FROM users WHERE student_id=?', a.student_id);
  if (studentUser) {
    notify(studentUser.id, 'Appointment Missed',
      a.ref + ' (' + a.date + ' ' + a.start_time + ') was marked as a no-show. You may book again.');
  }
  res.json(q.get('SELECT * FROM appointments WHERE id=?', a.id));
});

module.exports = router;
