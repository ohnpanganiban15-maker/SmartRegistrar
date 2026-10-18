/* =====================================================
   routes/requests.js — document requests
===================================================== */
const express = require('express');
const { q, logActivity } = require('../db');
const { requireAuth, validateBody } = require('../auth');

const router = express.Router();

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

/* PUT /api/requests/:id/status — admin updates, or student cancels own */
router.put('/:id/status', requireAuth, (req, res) => {
  const reqRow = q.get('SELECT * FROM document_requests WHERE id=?', req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'Request not found' });

  const { status, reason } = req.body || {};
  const allowed = ['Pending', 'Processing', 'Ready for Pickup', 'Completed', 'Rejected', 'Cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  if (req.user.role !== 'admin') {
    if (status !== 'Cancelled') return res.status(403).json({ error: 'Only the registrar can change this status' });
    if (reqRow.student_id !== req.user.studentId) return res.status(403).json({ error: 'Not your request' });
    if (!['Pending', 'Processing'].includes(reqRow.status)) {
      return res.status(409).json({ error: 'This request can no longer be cancelled' });
    }
  }

  q.run('UPDATE document_requests SET status=?, updated_at=datetime(\'now\') WHERE id=?', status, reqRow.id);

  const studentUser = q.get('SELECT id FROM users WHERE student_id=?', reqRow.student_id);
  const titles = {
    Processing: 'Request Now Processing', 'Ready for Pickup': 'Document Ready for Pickup',
    Completed: 'Request Completed', Rejected: 'Request Rejected', Cancelled: 'Request Cancelled',
    Pending: 'Request Reopened'
  };
  if (studentUser) {
    notify(studentUser.id, titles[status] || 'Request Updated',
      reqRow.ref + ' (' + reqRow.doc_type + ') → ' + status + (reason ? '. Reason: ' + reason : '.'));
  }
  logActivity(req.user.id, req.user.name, 'REQUEST_' + status.toUpperCase().replace(/ /g, '_'), reqRow.ref);
  res.json({ message: 'Request marked as ' + status });
});

/* PUT /api/requests/:id/pickup — admin sets the date the document can be claimed */
router.put('/:id/pickup', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the registrar can set the pickup date' });
  }
  const reqRow = q.get('SELECT * FROM document_requests WHERE id=?', req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'Request not found' });
  const date = String((req.body || {}).date || '').trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }
  q.run('UPDATE document_requests SET pickup_date=?, updated_at=datetime(\'now\') WHERE id=?', date, reqRow.id);
  if (date && date !== (reqRow.pickup_date || '')) {
    const studentUser = q.get('SELECT id FROM users WHERE student_id=?', reqRow.student_id);
    if (studentUser) {
      notify(studentUser.id, 'Pickup Date Set',
        reqRow.ref + ' (' + reqRow.doc_type + ') can be claimed on ' + date + '.', 'request');
    }
  }
  logActivity(req.user.id, req.user.name, 'SET_PICKUP_DATE', reqRow.ref + ' ' + (date || '(none)'));
  res.json({ message: 'Pickup date saved', pickup_date: date });
});

module.exports = router;
