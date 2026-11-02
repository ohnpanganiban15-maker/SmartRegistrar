/* =====================================================
   routes/misc.js — dashboard stats, reports, activity
   logs, and QR code lookup
===================================================== */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { q, db, logActivity } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');
const { version, bootedAt } = require('../version');

const router = express.Router();

/* GET /api/app/version — public: which build is live (update notifier).
   Clients compare this against the build they loaded; a mismatch means
   a new deploy happened and the "update available" banner is shown. */
router.get('/app/version', (req, res) => {
  res.json({ version, updated_at: bootedAt, name: 'CDLSHS Smart Registrar' });
});

/* GET /api/dashboard/stats — numbers for dashboard cards */
router.get('/dashboard/stats', requireAuth, (req, res) => {
  const c = sql => q.get(sql).c;
  if (req.user.role === 'admin') {
    return res.json({
      role: 'admin',
      totalStudents: c("SELECT COUNT(*) c FROM students"),
      pendingAppointments: c("SELECT COUNT(*) c FROM appointments WHERE status='Pending'"),
      approvedAppointments: c("SELECT COUNT(*) c FROM appointments WHERE status IN ('Approved','Confirmed')"),
      completedAppointments: c("SELECT COUNT(*) c FROM appointments WHERE status='Completed'"),
      pendingRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Pending'"),
      processingRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Processing'"),
      completedRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Completed'"),
      cancelledRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status IN ('Cancelled','Rejected')"),
      openChats: c("SELECT COUNT(*) c FROM messages WHERE status='Open'"),
      unreadNotifications: c('SELECT COUNT(*) c FROM notifications WHERE is_read=0')
    });
  }
  const sid = req.user.studentId;
  res.json({
    role: 'student',
    pendingAppointments: c("SELECT COUNT(*) c FROM appointments WHERE status='Pending' AND student_id=" + (sid || -1)),
    approvedAppointments: c("SELECT COUNT(*) c FROM appointments WHERE status IN ('Approved','Confirmed') AND student_id=" + (sid || -1)),
    pendingRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Pending' AND student_id=" + (sid || -1)),
    processingRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Processing' AND student_id=" + (sid || -1)),
    completedRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Completed' AND student_id=" + (sid || -1)),
    readyRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Ready for Pickup' AND student_id=" + (sid || -1)),
    unreadNotifications: c('SELECT COUNT(*) c FROM notifications WHERE is_read=0 AND user_id=' + req.user.id)
  });
});

/* GET /api/reports — admin: counts per month + status breakdown */
router.get('/reports', requireAuth, requireAdmin, (req, res) => {
  const appointmentsByStatus = q.all('SELECT status, COUNT(*) c FROM appointments GROUP BY status');
  const requestsByStatus = q.all('SELECT status, COUNT(*) c FROM document_requests GROUP BY status');
  const appointmentsByMonth = q.all(
    `SELECT strftime('%Y-%m', created_at) month, COUNT(*) c FROM appointments
     WHERE created_at >= date('now','-6 months') GROUP BY month ORDER BY month`
  );
  const requestsByMonth = q.all(
    `SELECT strftime('%Y-%m', created_at) month, COUNT(*) c FROM document_requests
     WHERE created_at >= date('now','-6 months') GROUP BY month ORDER BY month`
  );
  const topServices = q.all(
    'SELECT service, COUNT(*) c FROM appointments GROUP BY service ORDER BY c DESC LIMIT 5'
  );
  const topDocuments = q.all(
    'SELECT doc_type, COUNT(*) c FROM document_requests GROUP BY doc_type ORDER BY c DESC LIMIT 5'
  );
  res.json({ appointmentsByStatus, requestsByStatus, appointmentsByMonth, requestsByMonth, topServices, topDocuments });
});

/* GET /api/logs — admin: activity log */
router.get('/logs', requireAuth, requireAdmin, (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit || '100', 10) || 100);
  res.json(q.all('SELECT * FROM activity_logs ORDER BY id DESC LIMIT ?', limit));
});

/* ---- CSV export (admin) ---- */
const EXPORTS = {
  students: `SELECT student_number, first_name, middle_name, last_name, grade_level, strand, contact, email, status, created_at FROM students ORDER BY id`,
  requests: `SELECT ref, student_name, doc_type, quantity, purpose, pickup_date, notes, status, created_at, updated_at FROM document_requests ORDER BY id`,
  logs: `SELECT user_name, action, details, created_at FROM activity_logs ORDER BY id DESC`
};
function csvCell(v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
router.get('/export/:kind', requireAuth, requireAdmin, (req, res) => {
  const sql = EXPORTS[req.params.kind];
  if (!sql) return res.status(404).json({ error: 'Unknown export type' });
  const rows = q.all(sql);
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const lines = [cols.join(',')];
  for (const row of rows) lines.push(cols.map(c => csvCell(row[c])).join(','));
  const stamp = new Date().toISOString().slice(0, 10);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="smart-registrar-' + req.params.kind + '-' + stamp + '.csv"');
  res.send(lines.join('\r\n'));
});

/* ---- database backup (admin): snapshots into backups/ and downloads ---- */
router.post('/backup', requireAuth, requireAdmin, (req, res) => {
  try {
    const dir = path.join(__dirname, '..', '..', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const file = path.join(dir, 'smart-registrar-' + stamp + '.db');
    db.exec("VACUUM INTO '" + file.replace(/'/g, "''") + "'");
    logActivity(req.user.id, req.user.name, 'BACKUP', path.basename(file));
    res.download(file, path.basename(file));
  } catch (e) {
    res.status(500).json({ error: 'Backup failed: ' + e.message });
  }
});

/* GET /api/qr/lookup?code=APT-0001 | REQ-0001 | STU-12
   Used by the QR scanner. Returns only non-sensitive fields. */
router.get('/qr/lookup', requireAuth, (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'No code provided' });

  if (code.startsWith('APT-')) {
    const a = q.get('SELECT * FROM appointments WHERE ref=?', code);
    if (!a) return res.status(404).json({ error: 'No appointment found for ' + code });
    return res.json({
      type: 'appointment', ref: a.ref, name: a.student_name, service: a.service,
      date: a.date, time: a.start_time, status: a.status
    });
  }
  if (code.startsWith('REQ-')) {
    const r = q.get('SELECT * FROM document_requests WHERE ref=?', code);
    if (!r) return res.status(404).json({ error: 'No request found for ' + code });
    return res.json({
      type: 'document_request', ref: r.ref, name: r.student_name, service: r.doc_type,
      quantity: r.quantity, purpose: r.purpose || '',
      date: r.pickup_date || r.created_at.slice(0, 10), time: '', status: r.status
    });
  }
  if (code.startsWith('STU-')) {
    const num = code.slice(4);
    const s = q.get('SELECT student_number, first_name, last_name, grade_level, strand, status FROM students WHERE student_number=? OR CAST(id AS TEXT)=?',
      num, num);
    if (!s) return res.status(404).json({ error: 'No student found for ' + code });
    return res.json({
      type: 'student', ref: code, name: s.first_name + ' ' + s.last_name,
      service: (s.grade_level ? 'Grade ' + s.grade_level + ' ' : '') + s.strand,
      date: s.student_number, time: 'ID', status: s.status
    });
  }
  res.status(400).json({ error: 'Unrecognized code format' });
});

module.exports = router;
