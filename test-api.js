/* API smoke test for Smart Registrar — run: node test-api.js */
const BASE = process.env.BASE || 'http://localhost:3000';
const { purge } = require('./test-db');
let pass = 0, fail = 0;
const assert = (c, msg) => { if (c) { pass++; console.log('PASS:', msg); } else { fail++; console.log('FAIL:', msg); process.exitCode = 1; } };

async function call(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  let text = '';
  try { text = await res.text(); data = JSON.parse(text); } catch (e) {}
  return { status: res.status, data, text, headers: res.headers };
}

(async () => {
  /* start from a clean, example-free database */
  purge();

  /* --- auth --- */
  let r = await call('POST', '/api/auth/login', null, { email: 'admin@cdlshs.edu.ph', password: 'admin123' });
  assert(r.status === 200 && r.data.token, 'admin login');
  const admin = r.data.token;

  /* --- fixture student (tests register their own data — no seed examples) --- */
  const uniq = Date.now().toString(36);
  const stuEmail = 'fixture.student.' + uniq + '@cdlshs.edu.ph';
  const stuNum = 'S-2026-' + uniq.toUpperCase().slice(-6);
  r = await call('POST', '/api/auth/register', null, {
    firstName: 'Fixture', lastName: 'Student', email: stuEmail,
    password: 'fix1234', studentNumber: stuNum, gradeLevel: '12', strand: 'STEM'
  });
  assert(r.status === 201 && r.data.devOtp, 'student self-register (OTP sent)');
  r = await call('POST', '/api/auth/register/verify-otp', null, { email: stuEmail, otp: r.data.devOtp });
  assert(r.status === 201, 'OTP verified → account created');

  r = await call('POST', '/api/auth/login', null, { email: stuEmail, password: 'fix1234' });
  assert(r.status === 200 && r.data.token && r.data.user.role === 'student', 'student login');
  const student = r.data.token;

  r = await call('POST', '/api/auth/login', null, { email: stuEmail, password: 'wrong' });
  assert(r.status === 401, 'wrong password rejected');

  r = await call('GET', '/api/auth/me', student);
  assert(r.status === 200 && r.data.role === 'student', 'me endpoint with token');

  r = await call('GET', '/api/auth/me', null);
  assert(r.status === 401, 'no token → 401');

  /* --- register (unique per run so the test can repeat) --- */
  const test2Email = 'test.student.' + uniq + '@cdlshs.edu.ph';
  const test2Num = 'S-2026-T' + uniq.toUpperCase().slice(-6);
  r = await call('POST', '/api/auth/register', null, {
    firstName: 'Test', lastName: 'Student', email: test2Email,
    password: 'test123', studentNumber: test2Num, gradeLevel: '12', strand: 'STEM'
  });
  assert(r.status === 201 && r.data.devOtp, 'second register (OTP sent)');
  r = await call('POST', '/api/auth/register/verify-otp', null, { email: test2Email, otp: r.data.devOtp });
  assert(r.status === 201, 'second OTP verified');
  r = await call('POST', '/api/auth/login', null, { email: test2Email, password: 'test123' });
  assert(r.status === 200, 'new student can log in');

  /* --- slots --- */
  r = await call('GET', '/api/slots', student);
  assert(r.status === 200 && Array.isArray(r.data) && r.data.length > 0, 'slots list for booking (' + r.data.length + ' slots)');
  const freeSlot = r.data.find(s => !s.is_booked);
  assert(!!freeSlot, 'a free slot exists');

  /* --- booking + double booking --- */
  r = await call('POST', '/api/appointments', student, { slotId: freeSlot.id, service: 'Certificate of Enrollment', purpose: 'Test booking' });
  assert(r.status === 201 && /^APT-\d{4}$/.test(r.data.ref), 'book appointment → ref ' + (r.data && r.data.ref));
  const apptId = r.data.id, apptRef = r.data.ref;

  r = await call('POST', '/api/appointments', student, { slotId: freeSlot.id, service: 'Other' });
  assert(r.status === 409, 'double booking prevented → 409');

  /* --- student sees own only --- */
  r = await call('GET', '/api/appointments', student);
  assert(r.status === 200 && r.data.every(a => a.student_name === 'Fixture Student'), 'student sees only own appointments');

  /* --- student cannot approve --- */
  r = await call('PUT', `/api/appointments/${apptId}/status`, student, { status: 'Approved' });
  assert(r.status === 403, 'student cannot approve own appointment');

  /* --- admin approve → notification --- */
  r = await call('PUT', `/api/appointments/${apptId}/status`, admin, { status: 'Approved' });
  assert(r.status === 200, 'admin approves appointment');
  r = await call('GET', '/api/notifications', student);
  assert(r.status === 200 && r.data.some(n => n.title.includes('Approved')), 'student got approval notification');

  /* --- reschedule --- */
  const free2 = (await call('GET', '/api/slots', admin)).data.find(s => !s.is_booked && s.id !== freeSlot.id);
  r = await call('PUT', `/api/appointments/${apptId}/reschedule`, admin, { slotId: free2.id });
  assert(r.status === 200 && r.data.appointment.date === free2.date, 'admin reschedules appointment');
  assert(r.data.appointment.status === 'Pending', 'rescheduled → Pending again');

  /* --- complete --- */
  r = await call('PUT', `/api/appointments/${apptId}/status`, admin, { status: 'Completed' });
  assert(r.status === 200, 'admin completes appointment');

  /* --- document requests --- */
  r = await call('GET', '/api/requests/types', student);
  assert(r.status === 200 && r.data.length >= 8, 'document types list (' + r.data.length + ')');
  r = await call('POST', '/api/requests', student, { docType: 'Form 138', quantity: 2, purpose: 'Enrollment', pickupDate: '2026-10-20' });
  assert(r.status === 201 && /^REQ-\d{4}$/.test(r.data.ref), 'submit request → ' + (r.data && r.data.ref));
  assert(r.data.pickup_date === '', 'student cannot set pickup date (left empty for admin)');
  const reqId = r.data.id;
  const reqRef = r.data.ref;
  r = await call('PUT', `/api/requests/${reqId}/pickup`, student, { date: '2026-10-20' });
  assert(r.status === 403, 'student blocked from setting pickup date');
  r = await call('PUT', `/api/requests/${reqId}/pickup`, admin, { date: 'not-a-date' });
  assert(r.status === 400, 'invalid pickup date rejected');
  r = await call('PUT', `/api/requests/${reqId}/pickup`, admin, { date: '2026-10-20' });
  assert(r.status === 200 && r.data.pickup_date === '2026-10-20', 'admin sets the pickup date');
  r = await call('PUT', `/api/requests/${reqId}/status`, admin, { status: 'Ready for Pickup' });
  assert(r.status === 200, 'admin sets request Ready for Pickup');
  r = await call('GET', '/api/notifications', student);
  assert(r.data.some(n => n.title.includes('Ready for Pickup')), 'ready-for-pickup notification');

  /* --- students CRUD (admin) --- */
  r = await call('GET', '/api/students?search=' + stuNum, admin);
  assert(r.status === 200 && r.data.length >= 1, 'admin search students');
  r = await call('GET', '/api/students', student);
  assert(r.status === 403, 'student blocked from admin students list');

  r = await call('POST', '/api/students', admin, { firstName: 'Temp', lastName: 'Student', studentNumber: 'TMP-' + uniq.toUpperCase() });
  if (r.status !== 201) console.log('  [debug add student]', r.status, JSON.stringify(r.data));
  assert(r.status === 201, 'admin adds student');
  const sid = r.data.id;
  r = await call('PUT', `/api/students/${sid}`, admin, { firstName: 'Temp2', lastName: 'Student', studentNumber: 'TMP-' + uniq.toUpperCase(), gradeLevel: '11' });
  assert(r.status === 200, 'admin edits student');
  r = await call('DELETE', `/api/students/${sid}`, admin);
  assert(r.status === 200, 'admin deletes student');

  /* --- slots admin --- */
  r = await call('POST', '/api/slots', admin, { date: '2026-12-24', startTime: '08:00', endTime: '09:00' });
  assert(r.status === 201, 'admin adds slot');
  const slotId = r.data.id;
  r = await call('DELETE', `/api/slots/${slotId}`, admin);
  assert(r.status === 200, 'admin deletes unbooked slot');
  r = await call('DELETE', `/api/slots/${free2.id}`, admin);
  assert(r.status === 409, 'booked slot cannot be deleted');
  r = await call('POST', '/api/slots/close-date', admin, { date: freeSlot.date, status: 'closed' });
  assert(r.status === 200, 'close whole date');
  r = await call('POST', '/api/slots/close-date', admin, { date: freeSlot.date, status: 'available' });
  assert(r.status === 200, 'reopen whole date');

  /* --- customer service --- */
  r = await call('POST', '/api/chat', student, { subject: 'How long is processing?', body: 'Please advise.' });
  assert(r.status === 201, 'student sends inquiry');
  const msgId = r.data.id;
  r = await call('GET', '/api/chat', admin);
  assert(r.status === 200 && r.data.some(m => m.id === msgId), 'admin sees inquiry');
  r = await call('PUT', `/api/chat/${msgId}/reply`, admin, { reply: '2-3 working days.' });
  assert(r.status === 200, 'admin replies');
  r = await call('GET', '/api/notifications', student);
  assert(r.data.some(n => n.title.includes('Replied')), 'reply notification');

  /* --- announcements --- */
  r = await call('POST', '/api/announcements', admin, { title: 'Test Notice', body: 'Body' });
  assert(r.status === 201, 'admin posts announcement');
  r = await call('GET', '/api/announcements', student);
  assert(r.status === 200 && r.data.some(a => a.title === 'Test Notice'), 'student sees announcement');
  const annId = r.data.find(a => a.title === 'Test Notice').id;
  r = await call('DELETE', `/api/announcements/${annId}`, admin);
  assert(r.status === 200, 'admin deletes announcement');

  /* --- QR lookup --- */
  r = await call('GET', '/api/qr/lookup?code=' + apptRef, admin);
  assert(r.status === 200 && r.data.type === 'appointment', 'QR lookup appointment');
  r = await call('GET', '/api/qr/lookup?code=' + reqRef, admin);
  assert(r.status === 200 && r.data.type === 'document_request', 'QR lookup request');
  r = await call('GET', '/api/qr/lookup?code=STU-' + stuNum, admin);
  assert(r.status === 200 && r.data.type === 'student' && !('contact' in r.data), 'QR student lookup hides sensitive fields');
  r = await call('GET', '/api/qr/lookup?code=BLAH', admin);
  assert(r.status === 400, 'QR unknown code → 400');

  /* --- dashboard + reports + logs --- */
  r = await call('GET', '/api/dashboard/stats', admin);
  assert(r.status === 200 && r.data.totalStudents >= 1, 'admin dashboard stats');
  r = await call('GET', '/api/dashboard/stats', student);
  assert(r.status === 200 && r.data.role === 'student', 'student dashboard stats');
  r = await call('GET', '/api/reports', admin);
  assert(r.status === 200 && Array.isArray(r.data.appointmentsByStatus), 'admin reports');
  r = await call('GET', '/api/logs', admin);
  assert(r.status === 200 && r.data.length > 0, 'activity logs recorded');
  r = await call('GET', '/api/logs', student);
  assert(r.status === 403, 'student blocked from logs');

  /* --- notifications read --- */
  r = await call('PUT', '/api/notifications/read-all', student);
  assert(r.status === 200, 'mark all notifications read');
  r = await call('GET', '/api/notifications/unread-count', student);
  assert(r.status === 200 && r.data.count === 0, 'unread count is 0 after read-all');

  /* --- safety: login lockout --- */
  const lockEmail = 'lock.test.' + uniq + '@cdlshs.edu.ph';
  r = await call('POST', '/api/auth/register', null, {
    firstName: 'Lock', lastName: 'Tester', email: lockEmail,
    password: 'lock123', studentNumber: 'S-2026-L' + uniq.toUpperCase().slice(-6),
    gradeLevel: '12', strand: 'STEM'
  });
  assert(r.status === 201 && r.data.devOtp, 'lockout test account register (OTP sent)');
  r = await call('POST', '/api/auth/register/verify-otp', null, { email: lockEmail, otp: r.data.devOtp });
  assert(r.status === 201, 'lockout test account OTP verified');
  for (let i = 0; i < 5; i++) {
    r = await call('POST', '/api/auth/login', null, { email: lockEmail, password: 'wrong-pass-' + i });
  }
  assert(r.status === 429, 'account locked after 5 failed logins');
  r = await call('POST', '/api/auth/login', null, { email: lockEmail, password: 'lock123' });
  assert(r.status === 429, 'locked account rejected even with correct password');

  /* --- safety: change password (OTP flow) + session invalidation --- */
  r = await call('POST', '/api/auth/change-password/request-otp', student, { currentPassword: 'wrong', newPassword: 'newpass1' });
  assert(r.status === 400, 'change-password rejects wrong current password');
  r = await call('POST', '/api/auth/change-password/request-otp', student, { currentPassword: 'fix1234', newPassword: 'abc' });
  assert(r.status === 400, 'change-password rejects short new password');
  r = await call('POST', '/api/auth/change-password/request-otp', student, { currentPassword: 'fix1234', newPassword: 'newpass1' });
  assert(r.status === 200 && r.data.devOtp, 'change-password OTP sent (dev)');
  r = await call('POST', '/api/auth/change-password/verify-otp', student, { otp: r.data.devOtp });
  assert(r.status === 200 && r.data.token, 'change-password OTP verified, fresh token issued');
  const student2token = r.data.token;
  r = await call('GET', '/api/auth/me', student);
  assert(r.status === 401, 'old session invalidated after password change');
  r = await call('GET', '/api/auth/me', student2token);
  assert(r.status === 200, 'fresh token works after password change');
  r = await call('POST', '/api/auth/login', null, { email: stuEmail, password: 'fix1234' });
  assert(r.status === 401, 'old password no longer works');
  r = await call('POST', '/api/auth/login', null, { email: stuEmail, password: 'newpass1' });
  assert(r.status === 200, 'login works with the new password');
  const stuFresh = r.data.token;

  /* --- safety: CSV export + backup --- */
  r = await call('GET', '/api/export/students', admin);
  assert(r.status === 200 && r.text.includes('student_number'), 'admin exports students CSV');
  r = await call('GET', '/api/export/requests', admin);
  assert(r.status === 200 && r.text.includes('pickup_date'), 'admin exports requests CSV');
  r = await call('GET', '/api/export/logs', admin);
  assert(r.status === 200 && r.text.includes('action'), 'admin exports activity logs CSV');
  r = await call('GET', '/api/export/nope', admin);
  assert(r.status === 404, 'unknown export kind → 404');
  r = await call('GET', '/api/export/students', student2token);
  assert(r.status === 403, 'student blocked from CSV export');
  r = await call('POST', '/api/backup', admin);
  assert(r.status === 200, 'admin backup created');
  r = await call('POST', '/api/backup', student2token);
  assert(r.status === 403, 'student blocked from backup');

  /* --- safety: restore original password so runs stay repeatable --- */
  r = await call('POST', '/api/auth/change-password/request-otp', stuFresh, { currentPassword: 'newpass1', newPassword: 'newpass1' });
  assert(r.status === 400, 'change-password rejects same password');
  r = await call('POST', '/api/auth/change-password/request-otp', stuFresh, { currentPassword: 'newpass1', newPassword: 'fix1234' });
  assert(r.status === 200 && r.data.devOtp, 'restore password OTP sent');
  r = await call('POST', '/api/auth/change-password/verify-otp', stuFresh, { otp: r.data.devOtp });
  assert(r.status === 200, 'password restored for next test run');
  r = await call('POST', '/api/auth/login', null, { email: stuEmail, password: 'fix1234' });
  assert(r.status === 200 && r.data.token, 'original login restored');

  /* --- unknown route --- */
  r = await call('GET', '/api/nope', admin);
  assert(r.status === 404, 'unknown API route → JSON 404');

  /* --- frontend served --- */
  const home = await fetch(BASE + '/');
  const html = await home.text();
  assert(home.status === 200 && html.includes('Smart Registrar'), 'frontend index.html served');

  /* leave the database example-free for the user */
  purge();

  console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
