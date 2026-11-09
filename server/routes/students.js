/* =====================================================
   routes/students.js — admin: manage student records
===================================================== */
const express = require('express');
const { q, logActivity } = require('../db');
const { requireAuth, requireAdmin, validateBody } = require('../auth');

const router = express.Router();

/* ---- student self-service (BEFORE the admin middleware below) ---- */

/* PUT /api/students/me/photo — student uploads own profile picture (base64 data URL) */
router.put('/me/photo', requireAuth, (req, res) => {
  if (req.user.role !== 'student' || !req.user.studentId) {
    return res.status(403).json({ error: 'Only students can upload a profile picture' });
  }
  const { photo } = req.body || {};
  if (!photo) {
    q.run("UPDATE students SET profile_photo='' WHERE id=?", req.user.studentId);
    return res.json({ message: 'Photo removed', profile_photo: '' });
  }
  if (typeof photo !== 'string' || !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(photo)) {
    return res.status(400).json({ error: 'Please upload a valid image file' });
  }
  if (photo.length > 1500000) {
    return res.status(400).json({ error: 'Image is too large — maximum 1.5 MB' });
  }
  q.run('UPDATE students SET profile_photo=? WHERE id=?', photo, req.user.studentId);
  logActivity(req.user.id, req.user.name, 'UPDATE_PHOTO', 'profile picture updated');
  res.json({ message: 'Profile picture saved', profile_photo: photo });
});

router.use(requireAuth, requireAdmin);

/* GET /api/students?search=&grade=&status= */
router.get('/', (req, res) => {
  const { search = '', grade = '', status = '' } = req.query;
  let sql = `SELECT s.*, u.email AS login_email, u.status AS account_status,
             (SELECT r.doc_type FROM document_requests r WHERE r.student_id = s.id
               ORDER BY r.id DESC LIMIT 1) AS last_doc_type,
             (SELECT r.status FROM document_requests r WHERE r.student_id = s.id
               ORDER BY r.id DESC LIMIT 1) AS last_req_status,
             (SELECT r.created_at FROM document_requests r WHERE r.student_id = s.id
               ORDER BY r.id DESC LIMIT 1) AS last_req_date,
             (SELECT r.ref FROM document_requests r WHERE r.student_id = s.id
               ORDER BY r.id DESC LIMIT 1) AS last_req_ref
             FROM students s LEFT JOIN users u ON u.id = s.user_id WHERE 1=1`;
  const params = [];
  if (search) {
    sql += ' AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.student_number LIKE ? OR s.email LIKE ?)';
    const like = '%' + search + '%';
    params.push(like, like, like, like);
  }
  if (grade) { sql += ' AND s.grade_level = ?'; params.push(grade); }
  if (status) { sql += ' AND s.status = ?'; params.push(status); }
  sql += ' ORDER BY s.last_name, s.first_name';
  res.json(q.all(sql, ...params));
});

/* POST /api/students */
router.post('/', (req, res) => {
  const b = req.body || {};
  if (!validateBody(res, b, ['firstName', 'lastName', 'studentNumber'])) return;
  if (q.get('SELECT id FROM students WHERE student_number = ?', String(b.studentNumber).trim())) {
    return res.status(409).json({ error: 'LRN already exists' });
  }
  const lastSchoolYear = String(b.lastSchoolYear || '').trim();
  if (lastSchoolYear && !/^\d{4}-\d{4}$/.test(lastSchoolYear)) {
    return res.status(400).json({ error: 'School year last attended must look like 2024-2025' });
  }
  const r = q.run(
    'INSERT INTO students (student_number, first_name, middle_name, last_name, grade_level, strand, last_school_year, contact, email, status) VALUES (?,?,?,?,?,?,?,?,?,?)',
    String(b.studentNumber).trim(), String(b.firstName).trim(), String(b.middleName || '').trim(),
    String(b.lastName).trim(), String(b.gradeLevel || '').trim(), String(b.strand || '').trim(),
    lastSchoolYear, String(b.contact || '').trim(), String(b.email || '').trim(),
    b.status === 'inactive' ? 'inactive' : 'active'
  );
  logActivity(req.user.id, req.user.name, 'ADD_STUDENT', b.firstName + ' ' + b.lastName);
  res.status(201).json({ id: Number(r.lastInsertRowid), message: 'Student added' });
});

/* PUT /api/students/:id — DISABLED: admin cannot edit student info */
router.put('/:id', (req, res) => {
  res.status(403).json({ error: 'Editing student information is disabled — records can only be updated by registration.' });
});

/* DELETE /api/students/:id */
router.delete('/:id', (req, res) => {
  const s = q.get('SELECT * FROM students WHERE id = ?', req.params.id);
  if (!s) return res.status(404).json({ error: 'Student not found' });
  const active = q.get(
    `SELECT COUNT(*) c FROM appointments WHERE student_id=? AND status IN ('Pending','Approved')`, s.id
  ).c;
  if (active > 0) {
    return res.status(409).json({ error: 'Cannot delete: student has active appointments' });
  }
  q.run('DELETE FROM students WHERE id = ?', s.id);
  logActivity(req.user.id, req.user.name, 'DELETE_STUDENT', s.first_name + ' ' + s.last_name);
  res.json({ message: 'Student deleted' });
});

/* GET /api/students/:id — profile with history */
router.get('/:id', (req, res) => {
  const s = q.get(
    `SELECT s.*, u.email AS login_email, u.status AS account_status
     FROM students s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?`, req.params.id
  );
  if (!s) return res.status(404).json({ error: 'Student not found' });
  const appointments = q.all('SELECT * FROM appointments WHERE student_id=? ORDER BY created_at DESC', s.id);
  const requests = q.all('SELECT * FROM document_requests WHERE student_id=? ORDER BY created_at DESC', s.id);
  res.json({ student: s, appointments, requests });
});

module.exports = router;
