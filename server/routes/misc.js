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
const { isConfigured, provider } = require('../mailer');

const router = express.Router();

/* GET /api/app/version — public: which build is live (update notifier).
   Clients compare this against the build they loaded; a mismatch means
   a new deploy happened and the "update available" banner is shown.

   `mail` reports whether an email provider is configured — a boolean only,
   so no secret ever leaves the server. mail:false means OTP runs in DEV MODE.
   `provider` is "brevo" (HTTPS, works on Render Free), "smtp" (Gmail) or "dev".

   `gmail` / `brevo` report, per expected variable, whether a NON-EMPTY value
   is present — enough to pinpoint a missing entry. `matched` lists the *names*
   (never values) of every environment variable containing "gmail", "brevo" or
   "mail_from" in any case, so a mistyped key such as "GMAIL_USER " is visible
   instead of silently ignored. Names are not credentials. */
router.get('/app/version', (req, res) => {
  const matched = Object.keys(process.env)
    .filter(k => /gmail|brevo|mail_from/i.test(k))
    .map(k => k.replace(/\s+$/, '') + (k !== k.replace(/\s+$/, '') ? ' <trailing-space>' : ''))
    .sort();
  res.json({
    version, updated_at: bootedAt, name: 'CDLSHS Smart Registrar',
    mail: isConfigured(),
    provider: provider(),
    gmail: {
      user: !!process.env.GMAIL_USER,
      appPassword: !!process.env.GMAIL_APP_PASSWORD,
      matched
    },
    brevo: {
      apiKey: !!process.env.BREVO_API_KEY,
      from: !!process.env.MAIL_FROM,
      senderName: !!process.env.MAIL_FROM_NAME
    }
  });
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
      underReviewRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Under Review'"),
      processingRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Processing'"),
      readyRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Ready for Pickup'"),
      completedRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Completed'"),
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
    underReviewRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Under Review' AND student_id=" + (sid || -1)),
    processingRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Processing' AND student_id=" + (sid || -1)),
    completedRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Completed' AND student_id=" + (sid || -1)),
    readyRequests: c("SELECT COUNT(*) c FROM document_requests WHERE status='Ready for Pickup' AND student_id=" + (sid || -1)),
    unreadNotifications: c('SELECT COUNT(*) c FROM notifications WHERE is_read=0 AND user_id=' + req.user.id)
  });
});

/* GET /api/reports — admin: counts per month + status breakdown */
router.get('/reports', requireAuth, requireAdmin, (req, res) => {
  const appointmentsByStatus = q.all('SELECT status, COUNT(*) c FROM appointments GROUP BY status');
  /* legacy Rejected/Cancelled rows (if any) stay in the DB for history but are
     excluded from every report so the registrar only sees the live workflow. */
  const requestsByStatus = q.all(
    `SELECT status, COUNT(*) c FROM document_requests
     WHERE status NOT IN ('Rejected','Cancelled') GROUP BY status`
  );
  const appointmentsByMonth = q.all(
    `SELECT strftime('%Y-%m', created_at) month, COUNT(*) c FROM appointments
     WHERE created_at >= date('now','-6 months') GROUP BY month ORDER BY month`
  );
  const requestsByMonth = q.all(
    `SELECT strftime('%Y-%m', created_at) month, COUNT(*) c FROM document_requests
     WHERE created_at >= date('now','-6 months') AND status NOT IN ('Rejected','Cancelled')
     GROUP BY month ORDER BY month`
  );
  const topServices = q.all(
    'SELECT service, COUNT(*) c FROM appointments GROUP BY service ORDER BY c DESC LIMIT 5'
  );
  const topDocuments = q.all(
    `SELECT doc_type, COUNT(*) c FROM document_requests
     WHERE status NOT IN ('Rejected','Cancelled') GROUP BY doc_type ORDER BY c DESC LIMIT 5`
  );
  res.json({ appointmentsByStatus, requestsByStatus, appointmentsByMonth, requestsByMonth, topServices, topDocuments });
});

/* GET /api/analytics — admin: KPIs for the analytics dashboard.
   Every number is derived from data that already exists — no new tables. */
router.get('/analytics', requireAuth, requireAdmin, (req, res) => {
  const one = sql => q.get(sql) || {};
  const num = v => (v === null || v === undefined || isNaN(v)) ? 0 : Number(v);
  /* analytics covers only the five live statuses — legacy Rejected/Cancelled
     rows remain in the database for history but never affect the numbers. */
  const LIVE = "status NOT IN ('Rejected','Cancelled')";
  const total = num(one('SELECT COUNT(*) c FROM document_requests WHERE ' + LIVE).c);
  const completed = num(one("SELECT COUNT(*) c FROM document_requests WHERE status='Completed'").c);
  const underReview = num(one("SELECT COUNT(*) c FROM document_requests WHERE status='Under Review'").c);
  const backlog = num(one(`SELECT COUNT(*) c FROM document_requests
    WHERE status IN ('Pending','Under Review','Processing') AND created_at < datetime('now','-2 days')`).c);
  const today = num(one("SELECT COUNT(*) c FROM document_requests WHERE date(created_at)=date('now') AND " + LIVE).c);
  const week = num(one("SELECT COUNT(*) c FROM document_requests WHERE created_at >= date('now','-7 days') AND " + LIVE).c);
  const claimed = num(one("SELECT COUNT(*) c FROM document_requests WHERE claimed_at != ''").c);
  const within24 = num(one(`SELECT COUNT(*) c FROM document_requests
    WHERE claimed_at != '' AND status='Completed'
      AND (julianday(updated_at) - julianday(claimed_at)) <= 1`).c);

  const apptTotal = num(one('SELECT COUNT(*) c FROM appointments').c);
  const apptShown = num(one("SELECT COUNT(*) c FROM appointments WHERE status IN ('Completed','Confirmed','Approved')").c);
  const apptLost = num(one("SELECT COUNT(*) c FROM appointments WHERE status IN ('Cancelled','Rejected')").c);

  res.json({
    requests: {
      total, completed, underReview, backlog, today, week, claimed,
      completionRate: total ? Math.round(completed / total * 100) : 0,
      underReviewRate: total ? Math.round(underReview / total * 100) : 0,
      avgTurnaroundH: num(one(`SELECT ROUND(AVG((julianday(updated_at) - julianday(created_at)) * 24), 1) h
        FROM document_requests WHERE status='Completed'`).h),
      avgClaimWindowH: num(one(`SELECT ROUND(AVG((julianday(updated_at) - julianday(claimed_at)) * 24), 1) h
        FROM document_requests WHERE claimed_at != '' AND status='Completed'`).h),
      within24hRate: claimed ? Math.round(within24 / claimed * 100) : 0
    },
    appointments: {
      total: apptTotal, shown: apptShown, lost: apptLost,
      showRate: apptTotal ? Math.round(apptShown / apptTotal * 100) : 0,
      pending: num(one("SELECT COUNT(*) c FROM appointments WHERE status='Pending'").c)
    },
    students: {
      total: num(one('SELECT COUNT(*) c FROM students').c),
      byGrade: q.all(`SELECT CASE WHEN grade_level='' THEN 'Unset' ELSE 'Grade ' || grade_level END label,
        COUNT(*) c FROM students GROUP BY grade_level ORDER BY label`)
    },
    trends: {
      byWeekday: q.all(`SELECT CAST(strftime('%w', created_at) AS INTEGER) d, COUNT(*) c
        FROM document_requests WHERE ${LIVE} GROUP BY d ORDER BY d`),
      byHour: q.all(`SELECT CAST(strftime('%H', created_at) AS INTEGER) h, COUNT(*) c
        FROM document_requests WHERE ${LIVE} GROUP BY h ORDER BY h`),
      byMonth: q.all(`SELECT strftime('%Y-%m', created_at) month, COUNT(*) c
        FROM document_requests WHERE created_at >= date('now','-6 months') AND ${LIVE}
        GROUP BY month ORDER BY month`)
    },
    top: {
      documents: q.all(`SELECT doc_type label, COUNT(*) c FROM document_requests
        WHERE ${LIVE} GROUP BY doc_type ORDER BY c DESC LIMIT 6`),
      students: q.all(`SELECT student_name label, COUNT(*) c FROM document_requests
        WHERE ${LIVE} GROUP BY student_name ORDER BY c DESC LIMIT 5`),
      services: q.all(`SELECT service label, COUNT(*) c FROM appointments
        GROUP BY service ORDER BY c DESC LIMIT 5`)
    },
    feedback: (() => {
      const f = q.get('SELECT COUNT(*) c, AVG(rating) a FROM feedback');
      return { total: f && f.c ? f.c : 0, avg: f && f.a ? Math.round(f.a * 10) / 10 : 0 };
    })()
  });
});

/* ---------- student feedback & ratings ---------- */

/* POST /api/feedback — student rates the registrar's service (1–5) */
router.post('/feedback', requireAuth, (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Only students can send feedback' });
  }
  const b = req.body || {};
  const rating = parseInt(b.rating, 10);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Choose a rating from 1 to 5 stars' });
  }
  const user = q.get('SELECT * FROM users WHERE id=?', req.user.id);
  const student = user && user.student_id ? q.get('SELECT * FROM students WHERE id=?', user.student_id) : null;
  if (!student) return res.status(404).json({ error: 'Student profile not found' });
  const comment = String(b.comment || '').trim().slice(0, 500);
  const r = q.run(
    'INSERT INTO feedback (student_id, student_name, rating, comment) VALUES (?,?,?,?)',
    student.id, student.first_name + ' ' + student.last_name, rating, comment
  );
  logActivity(req.user.id, req.user.name, 'SUBMIT_FEEDBACK', rating + ' star(s)');
  res.status(201).json(q.get('SELECT * FROM feedback WHERE id=?', Number(r.lastInsertRowid)));
});

/* GET /api/feedback — admin: every rating with the average + distribution */
router.get('/feedback', requireAuth, requireAdmin, (req, res) => {
  const rows = q.all('SELECT * FROM feedback ORDER BY id DESC LIMIT 200');
  const sum = rows.reduce((s, f) => s + f.rating, 0);
  res.json({
    rows,
    total: rows.length,
    avg: rows.length ? Math.round(sum / rows.length * 10) / 10 : 0,
    dist: [1, 2, 3, 4, 5].map(n => ({ rating: n, c: rows.filter(r => r.rating === n).length }))
  });
});

/* GET /api/feedback/mine — student: the ratings they sent */
router.get('/feedback/mine', requireAuth, (req, res) => {
  res.json(q.all('SELECT * FROM feedback WHERE student_id=? ORDER BY id DESC',
    req.user.studentId || 0));
});

/* GET /api/logs — admin: activity log, searchable + filterable
   ?search=  matches user, action or details
   ?action=  exact action code (e.g. REQUEST_COMPLETED)
   ?from= ?to=   inclusive date range (YYYY-MM-DD)                */
function logWhere(qs) {
  const where = [], params = [];
  const s = String(qs.search || '').trim();
  if (s) {
    where.push('(user_name LIKE ? OR action LIKE ? OR details LIKE ?)');
    const l = '%' + s + '%';
    params.push(l, l, l);
  }
  const a = String(qs.action || '').trim();
  if (a) { where.push('action = ?'); params.push(a); }
  const f = String(qs.from || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(f)) { where.push('created_at >= ?'); params.push(f + ' 00:00:00'); }
  const t = String(qs.to || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) { where.push("created_at < date(?, '+1 day')"); params.push(t); }
  return { sql: where.length ? ' WHERE ' + where.join(' AND ') : '', params };
}
router.get('/logs', requireAuth, requireAdmin, (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit || '100', 10) || 100);
  const w = logWhere(req.query);
  res.json(q.all('SELECT * FROM activity_logs' + w.sql +
    ' ORDER BY id DESC LIMIT ?', ...w.params, limit));
});

/* GET /api/logs/facets — admin: filter chips (action codes + users, with counts) */
router.get('/logs/facets', requireAuth, requireAdmin, (req, res) => {
  res.json({
    actions: q.all('SELECT action, COUNT(*) c FROM activity_logs GROUP BY action ORDER BY c DESC'),
    users: q.all('SELECT user_name, COUNT(*) c FROM activity_logs GROUP BY user_name ORDER BY c DESC LIMIT 20'),
    total: q.get('SELECT COUNT(*) c FROM activity_logs').c
  });
});

/* ---- CSV export (admin) ---- */
const EXPORTS = {
  students: `SELECT student_number, first_name, middle_name, last_name, grade_level, strand, contact, email, status, created_at FROM students ORDER BY id`,
  requests: `SELECT ref, student_name, doc_type, quantity, purpose, pickup_date, pickup_time, notes, status, created_at, updated_at FROM document_requests ORDER BY id`,
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
   Used by the QR scanner. Returns only non-sensitive fields plus an
   enhanced verification verdict (valid / in-window / expired / completed). */
function hoursLeft(stamp) {
  const end = Date.parse(String(stamp).replace(' ', 'T') + 'Z') + 24 * 3600 * 1000;
  if (isNaN(end)) return 0;
  return Math.max(0, Math.round((end - Date.now()) / 360000) / 10);
}
router.get('/qr/lookup', requireAuth, (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'No code provided' });
  const today = new Date().toISOString().slice(0, 10);

  if (code.startsWith('APT-')) {
    const a = q.get('SELECT * FROM appointments WHERE ref=?', code);
    if (!a) return res.status(404).json({ error: 'No appointment found for ' + code });
    let verify;
    if (['Cancelled', 'Rejected'].includes(a.status)) {
      verify = { verdict: 'INVALID', tone: 'bad', message: 'This appointment was ' + a.status.toLowerCase() + '.' };
    } else if (a.status === 'Completed') {
      verify = { verdict: 'COMPLETED', tone: 'muted', message: 'Appointment already completed.' };
    } else if (a.date < today) {
      verify = { verdict: 'EXPIRED', tone: 'warn', message: 'The scheduled date (' + a.date + ') has passed.' };
    } else {
      verify = {
        verdict: 'VALID', tone: 'ok',
        message: a.status === 'Pending'
          ? 'Valid — awaiting registrar approval.'
          : 'Valid — confirmed for ' + a.date + ' at ' + a.start_time + '.'
      };
    }
    return res.json({
      type: 'appointment', ref: a.ref, name: a.student_name, service: a.service,
      date: a.date, time: a.start_time, status: a.status, verify
    });
  }
  if (code.startsWith('REQ-')) {
    const r = q.get('SELECT * FROM document_requests WHERE ref=?', code);
    if (!r) return res.status(404).json({ error: 'No request found for ' + code });
    let verify;
    if (r.status === 'Completed') {
      verify = { verdict: 'COMPLETED', tone: 'muted', message: 'Already claimed — this request is completed.' };
    } else if (r.claimed_at && hoursLeft(r.claimed_at) > 0) {
      verify = {
        verdict: 'IN_WINDOW', tone: 'ok',
        message: 'Claim window running — auto-completes in ' + hoursLeft(r.claimed_at) + 'h.'
      };
    } else if (r.claimed_at) {
      verify = { verdict: 'EXPIRED', tone: 'warn', message: 'The 24-hour claim window has ended — completion is imminent.' };
    } else {
      verify = { verdict: 'VALID', tone: 'ok', message: 'Request is ' + r.status + ' — no claim window yet.' };
    }
    return res.json({
      type: 'document_request', ref: r.ref, name: r.student_name, service: r.doc_type,
      quantity: r.quantity, purpose: r.purpose || '',
      date: r.pickup_date || r.created_at.slice(0, 10), time: r.pickup_time || '', status: r.status,
      id: r.id, claimed_at: r.claimed_at || '', verify
    });
  }
  if (code.startsWith('STU-')) {
    const num = code.slice(4);
    const s = q.get('SELECT student_number, first_name, last_name, grade_level, strand, status FROM students WHERE student_number=? OR CAST(id AS TEXT)=?',
      num, num);
    if (!s) return res.status(404).json({ error: 'No student found for ' + code });
    const verify = s.status === 'active'
      ? { verdict: 'VALID', tone: 'ok', message: 'Enrolled student — identity verified.' }
      : { verdict: 'INVALID', tone: 'bad', message: 'This student record is marked ' + s.status + '.' };
    return res.json({
      type: 'student', ref: code, name: s.first_name + ' ' + s.last_name,
      service: (s.grade_level ? 'Grade ' + s.grade_level + ' ' : '') + s.strand,
      date: s.student_number, time: 'ID', status: s.status, verify
    });
  }
  res.status(400).json({ error: 'Unrecognized code format' });
});

module.exports = router;
