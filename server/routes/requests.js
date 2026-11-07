/* =====================================================
   routes/requests.js — document requests
===================================================== */
const express = require('express');
const { q, logActivity } = require('../db');
const { requireAuth, validateBody } = require('../auth');

const router = express.Router();

/* small human-readable helpers for notifications */
function longDate(iso) {
  const d = new Date(String(iso) + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function clock(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  let h = parseInt(m[1], 10);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return h + ':' + m[2] + ' ' + ap;
}
function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v); }
function validTime(v) { return /^([01]?\d|2[0-3]):[0-5]\d$/.test(v); }
function whenText(date, time) {
  if (!date) return '';
  return 'on ' + longDate(date) + (time ? ' at ' + clock(time) : '');
}

function notify(userId, title, body, kind) {
  q.run('INSERT INTO notifications (user_id, title, body, kind) VALUES (?,?,?,?)',
    userId, title, body, kind || 'request');
}

/* GET /api/requests/types — public list of document types */
router.get('/types', requireAuth, (req, res) => {
  res.json(q.all('SELECT * FROM document_types ORDER BY name'));
});

/* POST /api/requests — student submits a request */
router.post('/', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!validateBody(res, b, ['docType', 'purpose'])) return;
  const user = q.get('SELECT * FROM users WHERE id=?', req.user.id);
  if (!user || user.role !== 'student' || !user.student_id) {
    return res.status(403).json({ error: 'Only student accounts can request documents' });
  }
  const student = q.get('SELECT * FROM students WHERE id=?', user.student_id);
  const qty = Math.max(1, Math.min(50, parseInt(b.quantity || '1', 10) || 1));

  const r = q.run(
    `INSERT INTO document_requests (ref, student_id, student_name, doc_type, quantity, purpose, pickup_date, notes, status)
     VALUES ('TMP',?,?,?,?,?,?,?, 'Pending')`,
    student.id, student.first_name + ' ' + student.last_name,
    String(b.docType).trim(), qty, String(b.purpose).trim(),
    '', String(b.notes || '').trim()
  );
  const id = Number(r.lastInsertRowid);
  const ref = 'REQ-' + String(id).padStart(4, '0');
  q.run('UPDATE document_requests SET ref=? WHERE id=?', ref, id);
  const created = q.get('SELECT * FROM document_requests WHERE id=?', id);

  notify(user.id, 'Request Submitted', 'Your request ' + ref + ' (' + created.doc_type + ') is now pending.');
  q.all("SELECT id FROM users WHERE role='admin'").forEach(a =>
    notify(a.id, 'New Document Request', ref + ' — ' + created.doc_type + ' from ' + created.student_name + '.'));
  logActivity(req.user.id, req.user.name, 'SUBMIT_REQUEST', ref + ' ' + created.doc_type);
  res.status(201).json(created);
});

/* GET /api/requests — student: mine; admin: all (+filters) */
router.get('/', requireAuth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const { status = '', search = '' } = req.query;
  let sql = 'SELECT * FROM document_requests WHERE 1=1';
  const params = [];
  if (!isAdmin) { sql += ' AND student_id = ?'; params.push(req.user.studentId); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (search) { sql += ' AND (ref LIKE ? OR student_name LIKE ? OR doc_type LIKE ?)'; const l = '%' + search + '%'; params.push(l, l, l); }
  sql += ' ORDER BY created_at DESC';
  res.json(q.all(sql, ...params));
});

/* GET /api/requests/pending-count — admin badge (pending requests) */
router.get('/pending-count', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  res.json({ count: q.get("SELECT COUNT(*) c FROM document_requests WHERE status='Pending'").c });
});

/* GET /api/requests/:id/timeline — advanced tracking.
   Rebuilds the full step-by-step history of one request from the
   activity log (submitted → processing → ready → scanned → completed),
   plus the scheduled claim deadline. Owner student or admin only. */
const TIMELINE_ACTIONS = {
  SUBMIT_REQUEST: ['Request submitted', 'submitted'],
  REQUEST_PROCESSING: ['Moved to Processing', 'step'],
  REQUEST_READY_FOR_PICKUP: ['Marked Ready for Pickup', 'ready'],
  REQUEST_COMPLETED: ['Completed by the registrar', 'done'],
  REQUEST_AUTO_COMPLETED: ['Auto-completed after the 24-hour window', 'done'],
  REQUEST_REJECTED: ['Rejected', 'bad'],
  REQUEST_CANCELLED: ['Cancelled', 'bad'],
  REQUEST_PENDING: ['Reopened', 'step'],
  QR_CLAIM_SCAN: ['QR scanned — 24-hour claim window started', 'scan'],
  SET_PICKUP_SCHEDULE: ['Pickup schedule set', 'ready']
};
router.get('/:id/timeline', requireAuth, (req, res) => {
  const r = q.get('SELECT * FROM document_requests WHERE id=?', req.params.id);
  if (!r) return res.status(404).json({ error: 'Request not found' });
  if (req.user.role !== 'admin' && r.student_id !== req.user.studentId) {
    return res.status(403).json({ error: 'Not your request' });
  }
  const rows = q.all(
    `SELECT action, details, user_name, created_at FROM activity_logs
     WHERE details = ? OR details LIKE ? ORDER BY created_at ASC, id ASC`,
    r.ref, r.ref + ' %');
  const events = [];
  for (const l of rows) {
    const m = TIMELINE_ACTIONS[l.action];
    if (!m) continue;
    events.push({
      at: l.created_at, label: m[0], kind: m[1], actor: l.user_name || 'system',
      detail: l.action === 'SUBMIT_REQUEST' ? r.doc_type + ' × ' + r.quantity : ''
    });
  }
  /* the very first step is always the submission itself */
  if (!events.length || events[0].label !== 'Request submitted') {
    events.unshift({
      at: r.created_at, label: 'Request submitted', kind: 'submitted',
      actor: r.student_name, detail: r.doc_type + ' × ' + r.quantity
    });
  }
  /* the 24-hour claim deadline is a milestone worth showing */
  if (r.claimed_at && r.status !== 'Completed') {
    events.push({
      at: plus24h(r.claimed_at), label: 'Claim window ends — auto-completes',
      kind: 'scheduled', actor: 'system', detail: ''
    });
  }
  events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  res.json({
    ref: r.ref, status: r.status, doc_type: r.doc_type,
    pickup_date: r.pickup_date || '', pickup_time: r.pickup_time || '',
    claimed_at: r.claimed_at || '', events
  });
});

/* PUT /api/requests/:id/status — admin updates, or student cancels own
   Admin may also hand over the pickup date + time in this same call
   (the UI collects them the moment "Ready for Pickup" is chosen). */
router.put('/:id/status', requireAuth, (req, res) => {
  const reqRow = q.get('SELECT * FROM document_requests WHERE id=?', req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'Request not found' });

  const { status, reason, pickupDate, pickupTime } = req.body || {};
  const allowed = ['Pending', 'Processing', 'Ready for Pickup', 'Completed', 'Rejected', 'Cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  if (req.user.role !== 'admin') {
    if (status !== 'Cancelled') return res.status(403).json({ error: 'Only the registrar can change this status' });
    if (reqRow.student_id !== req.user.studentId) return res.status(403).json({ error: 'Not your request' });
    if (!['Pending', 'Processing'].includes(reqRow.status)) {
      return res.status(409).json({ error: 'This request can no longer be cancelled' });
    }
  }

  /* pickup schedule may ride along with the status change (admin only) */
  let date = reqRow.pickup_date || '';
  let time = reqRow.pickup_time || '';
  /* once Completed the pickup schedule is frozen forever */
  if (reqRow.status === 'Completed' &&
      (pickupDate !== undefined || pickupTime !== undefined)) {
    return res.status(409).json({ error: 'This request is Completed — the pickup schedule is locked' });
  }
  if (req.user.role === 'admin' &&
      (pickupDate !== undefined || pickupTime !== undefined)) {
    if (pickupDate !== undefined) {
      date = String(pickupDate == null ? '' : pickupDate).trim();
      if (date && !validDate(date)) return res.status(400).json({ error: 'Invalid pickup date format' });
    }
    if (pickupTime !== undefined) {
      time = String(pickupTime == null ? '' : pickupTime).trim();
      if (time && !validTime(time)) return res.status(400).json({ error: 'Invalid pickup time format' });
    }
  }

  q.run(`UPDATE document_requests SET status=?, pickup_date=?, pickup_time=?,
         updated_at=datetime('now') WHERE id=?`, status, date, time, reqRow.id);

  const studentUser = q.get('SELECT id FROM users WHERE student_id=?', reqRow.student_id);
  const titles = {
    Processing: 'Request Now Processing', 'Ready for Pickup': 'Document Ready for Pickup',
    Completed: 'Request Completed', Rejected: 'Request Rejected', Cancelled: 'Request Cancelled',
    Pending: 'Request Reopened'
  };
  if (studentUser) {
    let body = reqRow.ref + ' (' + reqRow.doc_type + ') → ' + status + (reason ? '. Reason: ' + reason : '.');
    if (status === 'Ready for Pickup' && date) {
      body += ' You can claim it ' + whenText(date, time) + '.';
    }
    notify(studentUser.id, titles[status] || 'Request Updated', body);
  }
  logActivity(req.user.id, req.user.name, 'REQUEST_' + status.toUpperCase().replace(/ /g, '_'), reqRow.ref);
  res.json({ message: 'Request marked as ' + status, pickup_date: date, pickup_time: time });
});

/* PUT /api/requests/:id/pickup — admin sets the date + time the document
   can be claimed (used when editing an already-scheduled pickup) */
router.put('/:id/pickup', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the registrar can set the pickup schedule' });
  }
  const reqRow = q.get('SELECT * FROM document_requests WHERE id=?', req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'Request not found' });
  if (reqRow.status === 'Completed') {
    return res.status(409).json({ error: 'This request is Completed — the pickup schedule is locked' });
  }
  const b = req.body || {};
  const date = String(b.date || '').trim();
  const time = String(b.time || '').trim();
  if (date && !validDate(date)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }
  if (time && !validTime(time)) {
    return res.status(400).json({ error: 'Invalid time format' });
  }
  q.run(`UPDATE document_requests SET pickup_date=?, pickup_time=?,
         updated_at=datetime('now') WHERE id=?`, date, time, reqRow.id);
  const changed = (date && date !== (reqRow.pickup_date || '')) ||
                  (time && time !== (reqRow.pickup_time || ''));
  if (changed) {
    const studentUser = q.get('SELECT id FROM users WHERE student_id=?', reqRow.student_id);
    if (studentUser) {
      notify(studentUser.id, 'Pickup Schedule Set',
        reqRow.ref + ' (' + reqRow.doc_type + ') can be claimed ' + whenText(date, time) + '.', 'request');
    }
  }
  logActivity(req.user.id, req.user.name, 'SET_PICKUP_SCHEDULE',
    reqRow.ref + ' ' + (date || '(none)') + (time ? ' ' + time : ''));
  res.json({ message: 'Pickup schedule saved', pickup_date: date, pickup_time: time });
});

/* ---- 24-hour claim window ----------------------------------------
   The moment the registrar scans a request's QR the clock starts:
   24 hours later the request auto-completes. The admin may still
   press "Completed" manually at any point before that. */
function utcNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}
function plus24h(stamp) {
  const t = new Date(String(stamp).replace(' ', 'T') + 'Z').getTime() + 24 * 3600 * 1000;
  if (isNaN(t)) return '';
  return new Date(t).toISOString().slice(0, 19).replace('T', ' ');
}

/* sweep: auto-complete every request whose 24-hour window has expired */
function sweepAutoComplete() {
  const due = q.all(`SELECT * FROM document_requests
    WHERE claimed_at != '' AND status != 'Completed'
      AND datetime(claimed_at, '+24 hours') <= datetime('now')`);
  for (const r of due) {
    q.run(`UPDATE document_requests SET status='Completed',
           updated_at=datetime('now') WHERE id=?`, r.id);
    const studentUser = q.get('SELECT id FROM users WHERE student_id=?', r.student_id);
    if (studentUser) {
      notify(studentUser.id, 'Request Completed',
        r.ref + ' (' + r.doc_type + ') → Completed. The 24-hour claim window has ended.', 'request');
    }
    logActivity(null, 'system', 'REQUEST_AUTO_COMPLETED', r.ref);
  }
  return due.length;
}
/* run the sweep every minute while the server is up */
setInterval(() => { try { sweepAutoComplete(); } catch (e) { /* keep the loop alive */ } }, 60000);

/* POST /api/requests/:id/claim — admin scans the request QR:
   starts (or reports) the 24-hour window. Idempotent — re-scanning
   does NOT restart the clock. */
router.post('/:id/claim', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the registrar can scan a request' });
  }
  const reqRow = q.get('SELECT * FROM document_requests WHERE id=?', req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'Request not found' });
  if (reqRow.status === 'Completed') {
    return res.json({
      message: 'Already completed', status: 'Completed',
      claimed_at: reqRow.claimed_at || '', auto_complete_at: '', started: false
    });
  }
  let claimedAt = reqRow.claimed_at || '';
  let started = false;
  if (!claimedAt) {
    claimedAt = utcNow();
    q.run(`UPDATE document_requests SET claimed_at=?, updated_at=datetime('now')
           WHERE id=?`, claimedAt, reqRow.id);
    started = true;
    const studentUser = q.get('SELECT id FROM users WHERE student_id=?', reqRow.student_id);
    if (studentUser) {
      notify(studentUser.id, 'Document Scanned at the Registrar',
        reqRow.ref + ' (' + reqRow.doc_type + ') was scanned. It will be marked Completed ' +
        'automatically in 24 hours unless the registrar completes it earlier.', 'request');
    }
    logActivity(req.user.id, req.user.name, 'QR_CLAIM_SCAN', reqRow.ref);
  }
  res.json({
    message: started ? '24-hour claim window started' : 'Claim window already running',
    started, status: reqRow.status,
    claimed_at: claimedAt, auto_complete_at: plus24h(claimedAt)
  });
});

/* POST /api/requests/auto-complete — admin: run the sweep on demand
   (also exercised by the test suite; the interval runs it every minute) */
router.post('/auto-complete', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  res.json({ completed: sweepAutoComplete() });
});

module.exports = router;
