/* =====================================================
   seed.js — realistic sample data for testing
   Runs automatically when the database is empty.
   You can also run it manually:  npm run seed
===================================================== */
const { db, q, logActivity } = require('./db');
const { hashPassword } = require('./auth');

function toISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* next N weekdays (Mon-Fri) starting today or tomorrow */
function nextWeekdays(n) {
  const out = [];
  const d = new Date();
  if (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  else d.setDate(d.getDate());
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  while (out.length < n) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(toISO(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function seed() {
  const existing = q.get('SELECT COUNT(*) AS c FROM users').c;
  if (existing > 0) {
    console.log('Database already has data — skipping seed. (Delete database/*.db to re-seed.)');
    return;
  }

  /* sample students/data only with SEED_SAMPLE=1 (demo classrooms);
     default = admin + document types + schedule slots only */
  const SAMPLE = process.env.SEED_SAMPLE === '1';

  console.log(SAMPLE ? 'Seeding sample data...' : 'Seeding base data (no sample students)...');

  /* ---- users: 1 admin ---- */
  q.run(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)",
    'Registrar Admin', 'admin@cdlshs.edu.ph', hashPassword('admin123'), 'admin'
  );

  const studentIds = [];

  if (SAMPLE) {
    const students = [
    ['Juan', 'Dela Cruz', '12', 'STEM', '09171234567', 'juan.delacruz@cdlshs.edu.ph', 'S-2026-00121'],
    ['Maria', 'Santos', '12', 'ABM', '09181234567', 'maria.santos@cdlshs.edu.ph', 'S-2026-00122'],
  ['Paolo', 'Reyes', '11', 'HUMMS', '09191234567', 'paolo.reyes@cdlshs.edu.ph', 'S-2026-00123'],
  ['Angela', 'Cruz', '12', 'STEM', '09201234567', 'angela.cruz@cdlshs.edu.ph', 'S-2026-00124'],
  ['Miguel', 'Garcia', '11', 'TVL - CSS', '09211234567', 'miguel.garcia@cdlshs.edu.ph', 'S-2026-00125'],
    ['Sofia', 'Lopez', '12', 'ABM', '09221234567', 'sofia.lopez@cdlshs.edu.ph',       'S-2026-00126']
    ];
    for (const [first, middle, grade, strand, contact, email, number] of students) {
      const r = q.run(
        'INSERT INTO students (student_number, first_name, last_name, grade_level, strand, contact, email) VALUES (?,?,?,?,?,?,?)',
        number, first, middle, grade, strand, contact, email
      );
      const sid = Number(r.lastInsertRowid);
      studentIds.push(sid);
      q.run(
        'INSERT INTO users (student_id, name, email, password_hash, role) VALUES (?,?,?,?,?)',
        sid, first + ' ' + middle, email, hashPassword('pass1234'), 'student'
      );
    }
  }

  /* ---- document types ---- */
  const docTypes = [
    'Certificate of Enrollment', 'Transcript of Records', 'Good Moral Certificate',
    'Diploma', 'Form 137', 'Form 138', 'SF9', 'SF10', 'Certification', 'Other Registrar Documents'
  ];
  for (const name of docTypes) q.run('INSERT OR IGNORE INTO document_types (name) VALUES (?)', name);

  /* ---- appointment slots: 14 weekdays, 3 slots each ---- */
  const dates = nextWeekdays(14);
  const times = [['08:00', '09:00'], ['10:00', '11:00'], ['13:00', '14:00']];
  const slotIds = [];
  for (const date of dates) {
    for (const [s, e] of times) {
      const r = q.run('INSERT INTO appointment_slots (date, start_time, end_time) VALUES (?,?,?)', date, s, e);
      slotIds.push({ id: Number(r.lastInsertRowid), date, start: s, end: e });
    }
  }

  /* ---- sample appointments / requests / messages (only with SEED_SAMPLE=1) ---- */
  if (SAMPLE) {
    const nameOf = sid => {
      const s = q.get('SELECT first_name, last_name FROM students WHERE id=?', sid);
      return s.first_name + ' ' + s.last_name;
    };
    const appts = [
      [studentIds[0], 'Certificate of Enrollment', 'Scholarship application', slotIds[0], 'Pending'],
      [studentIds[1], 'Transcript of Records', 'College application', slotIds[3], 'Approved'],
      [studentIds[2], 'Good Moral Certificate', 'Job application of parent', slotIds[6], 'Completed'],
      [studentIds[0], 'Form 137', 'Transfer requirement', slotIds[10], 'Pending'],
      [studentIds[3], 'Certification', 'Scholarship requirement', slotIds[13], 'Approved']
    ];
    for (const [sid, service, purpose, slot, status] of appts) {
      const r = q.run(
        `INSERT INTO appointments (ref, slot_id, student_id, student_name, service, purpose, date, start_time, end_time, status)
         VALUES ('TMP',?,?,?,?,?,?,?,?,?)`,
        slot.id, sid, nameOf(sid), service, purpose, slot.date, slot.start, slot.end, status
      );
      q.run('UPDATE appointments SET ref=? WHERE id=?', 'APT-' + String(r.lastInsertRowid).padStart(4, '0'), r.lastInsertRowid);
    }

    /* ---- sample document requests ---- */
    const requests = [
      [studentIds[0], 'Certificate of Enrollment', 2, 'Scholarship application', dates[1], '', 'Processing'],
      [studentIds[1], 'Form 137', 1, 'College admission', dates[2], 'Sealed copy please', 'Ready for Pickup'],
      [studentIds[4], 'Good Moral Certificate', 1, 'Sports tryout', dates[3], '', 'Pending'],
      [studentIds[5], 'Transcript of Records', 1, 'Transfer to another school', dates[4], '', 'Completed'],
      [studentIds[2], 'Certification', 3, 'Scholarship', dates[5], '', 'Pending']
    ];
    for (const [sid, type, qty, purpose, pickup, notes, status] of requests) {
      const r = q.run(
        `INSERT INTO document_requests (ref, student_id, student_name, doc_type, quantity, purpose, pickup_date, notes, status)
         VALUES ('TMP',?,?,?,?,?,?,?,?)`,
        sid, nameOf(sid), type, qty, purpose, pickup, notes, status
      );
      q.run('UPDATE document_requests SET ref=? WHERE id=?', 'REQ-' + String(r.lastInsertRowid).padStart(4, '0'), r.lastInsertRowid);
    }

    /* ---- announcements ---- */
    q.run("INSERT INTO announcements (title, body) VALUES (?,?)",
      'Midterm Clearance Schedule',
      'Clearance processing for the first semester is open from the 20th to the 30th of this month. Please settle all outstanding accounts before requesting documents.');
    q.run("INSERT INTO announcements (title, body) VALUES (?,?)",
      'Online Appointment Booking Now Available',
      'You can now book registrar appointments online. Pick an available slot, receive a reference number, and show your QR code upon arrival.');

    /* ---- customer service messages ---- */
    const allUsers = q.all("SELECT id, name FROM users WHERE role='student'");
    q.run('INSERT INTO messages (user_id, student_name, subject, body, status) VALUES (?,?,?,?,?)',
      allUsers[0].id, allUsers[0].name, 'Question about Form 137',
      'Good day! How many working days does it take to process Form 137?', 'Open');
    q.run(`INSERT INTO messages (user_id, student_name, subject, body, admin_reply, status, replied_at) VALUES (?,?,?,?,?,?,datetime('now'))`,
      allUsers[1].id, allUsers[1].name, 'Pickup schedule inquiry',
      'When can I claim my Certificate of Enrollment?',
      'You may pick it up on any school day from 8:00 AM to 4:00 PM at the registrar counter.', 'Resolved');

    /* ---- notifications ---- */
    const studentUsers = q.all("SELECT id FROM users WHERE role='student'");
    q.run('INSERT INTO notifications (user_id, title, body, kind) VALUES (?,?,?,?)',
      studentUsers[0].id, 'Appointment Pending', 'Your appointment APT-0001 is waiting for approval.', 'appointment');
    q.run('INSERT INTO notifications (user_id, title, body, kind) VALUES (?,?,?,?)',
      studentUsers[1].id, 'Request Ready for Pickup', 'Your REQ-0002 is ready for pickup at the registrar.', 'request');
    q.run('INSERT INTO notifications (user_id, title, body, kind) VALUES (?,?,?,?)',
      studentUsers[1].id, 'Appointment Approved', 'Your appointment APT-0002 has been approved.', 'appointment');
  }

  /* ---- activity logs ---- */
  logActivity(1, 'Registrar Admin', 'SYSTEM',
    SAMPLE ? 'Initial database created with sample data' : 'Initial database created (admin, document types, slots)');

  const counts = {
    users: q.get('SELECT COUNT(*) c FROM users').c,
    students: q.get('SELECT COUNT(*) c FROM students').c,
    slots: q.get('SELECT COUNT(*) c FROM appointment_slots').c,
    appointments: q.get('SELECT COUNT(*) c FROM appointments').c,
    requests: q.get('SELECT COUNT(*) c FROM document_requests').c
  };
  console.log('Seed complete:', counts);
}

if (require.main === module) seed();
module.exports = { seed };
