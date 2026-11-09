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
  let r = await call('POST', '/api/auth/login', null, { email: 'admin@cdlshs.edu.ph', password: 'registrar123' });
  assert(r.status === 200 && r.data.token, 'admin login');
  let admin = r.data.token;

  /* --- fixture student (tests register their own data — no seed examples) --- */
  const uniq = Date.now().toString(36);
  const stuEmail = 'fixture.student.' + uniq + '@cdlshs.edu.ph';
  const stuNum = 'S-2026-' + uniq.toUpperCase().slice(-6);
  r = await call('POST', '/api/auth/register', null, {
    firstName: 'Fixture', lastName: 'Student', email: stuEmail,
    password: 'fix12345', studentNumber: stuNum, gradeLevel: '12', strand: 'STEM'
  });
  assert(r.status === 201 && r.data.devOtp, 'student self-register (OTP sent)');
  r = await call('POST', '/api/auth/register/verify-otp', null, { email: stuEmail, otp: r.data.devOtp });
  assert(r.status === 201, 'OTP verified → account created');

  r = await call('POST', '/api/auth/login', null, { email: stuEmail, password: 'fix12345' });
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
    password: 'test1234', studentNumber: test2Num, gradeLevel: '12', strand: 'STEM'
  });
  assert(r.status === 201 && r.data.devOtp, 'second register (OTP sent)');
  r = await call('POST', '/api/auth/register/verify-otp', null, { email: test2Email, otp: r.data.devOtp });
  assert(r.status === 201, 'second OTP verified');
  r = await call('POST', '/api/auth/login', null, { email: test2Email, password: 'test1234' });
  assert(r.status === 200, 'new student can log in');

  /* --- strong password rules --- */
  r = await call('POST', '/api/auth/register', null, {
    firstName: 'Weak', lastName: 'Password', email: 'weak.' + uniq + '@cdlshs.edu.ph',
    password: '12345678', studentNumber: 'S-2026-W' + uniq.toUpperCase().slice(-6),
    gradeLevel: '11', strand: 'STEM'
  });
  assert(r.status === 400, 'weak password (12345678) rejected');
  r = await call('POST', '/api/auth/register', null, {
    firstName: 'Shorty', lastName: 'McPass', email: 'shorty.' + uniq + '@cdlshs.edu.ph',
    password: '123456', studentNumber: 'S-2026-X' + uniq.toUpperCase().slice(-6),
    gradeLevel: '11', strand: 'STEM'
  });
  assert(r.status === 400, 'weak password (123456, 6 chars) rejected');

  /* --- 1 Gmail = 1 account --- */
  r = await call('POST', '/api/auth/register', null, {
    firstName: 'Dup', lastName: 'Gmail', email: stuEmail,
    password: 'fix12345', studentNumber: 'S-2026-D' + uniq.toUpperCase().slice(-6),
    gradeLevel: '11', strand: 'STEM'
  });
  assert(r.status === 409, '1 Gmail = 1 account (duplicate email rejected)');

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
  assert(r.status === 200 && r.data.length >= 5, 'document types list (' + r.data.length + ')');
  r = await call('POST', '/api/requests', student, { docType: 'Form 138', quantity: 2, purpose: 'Enrollment', pickupDate: '2026-10-20' });
  assert(r.status === 201 && /^REQ-\d{4}$/.test(r.data.ref), 'submit request → ' + (r.data && r.data.ref));
  assert(r.data.pickup_date === '', 'student cannot set pickup date (left empty for admin)');
  const reqId = r.data.id;
  const reqRef = r.data.ref;
  r = await call('GET', '/api/notifications', admin);
  assert(r.status === 200 && r.data.some(n => n.title.includes('New Document Request')), 'admin notified of new request');
  r = await call('GET', '/api/requests/pending-count', admin);
  assert(r.status === 200 && r.data.count >= 1, 'admin pending-request badge count (' + r.data.count + ')');
  r = await call('GET', '/api/requests/pending-count', student);
  assert(r.status === 403, 'student blocked from pending-count');
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

  /* --- pickup date + time (admin supplies both) --- */
  r = await call('PUT', `/api/requests/${reqId}/pickup`, admin, { date: '2026-10-20', time: '99:99' });
  assert(r.status === 400, 'invalid pickup time rejected');
  r = await call('PUT', `/api/requests/${reqId}/pickup`, admin, { date: '2026-10-21', time: '14:30' });
  assert(r.status === 200 && r.data.pickup_time === '14:30', 'admin sets the pickup time');
  r = await call('GET', '/api/requests', admin);
  assert(r.data.some(x => x.id === reqId && x.pickup_time === '14:30'), 'pickup time persisted on the request');
  r = await call('PUT', `/api/requests/${reqId}/status`, admin, { status: 'Processing' });
  assert(r.status === 200, 'request moved back to Processing');
  r = await call('PUT', `/api/requests/${reqId}/status`, admin,
    { status: 'Ready for Pickup', pickupDate: '2026-10-22', pickupTime: '08:45' });
  assert(r.status === 200 && r.data.pickup_date === '2026-10-22' && r.data.pickup_time === '08:45',
    'status change carries pickup date + time in one call');
  r = await call('PUT', `/api/requests/${reqId}/status`, admin, { status: 'Processing', pickupDate: 'nope' });
  assert(r.status === 400, 'bad pickup date inside a status change rejected');
  r = await call('PUT', `/api/requests/${reqId}/status`, admin, { status: 'Processing', pickupTime: '25:00' });
  assert(r.status === 400, 'bad pickup time inside a status change rejected');
  r = await call('PUT', `/api/requests/${reqId}/status`, student,
    { status: 'Ready for Pickup', pickupDate: '2026-10-23', pickupTime: '10:00' });
  assert(r.status === 403, 'student cannot set a pickup schedule');
  /* --- five live statuses: Under Review replaces Rejected; no cancellation --- */
  r = await call('PUT', `/api/requests/${reqId}/status`, admin, { status: 'Under Review' });
  assert(r.status === 200, 'admin moves a request to Under Review');
  r = await call('GET', '/api/requests', admin);
  assert(r.data.find(x => x.id === reqId).status === 'Under Review',
    'Under Review persisted on the request');
  r = await call('GET', '/api/notifications', student);
  assert(r.data.some(n => n.title === 'Request Under Review'),
    'student notified when the request goes Under Review');
  r = await call('PUT', `/api/requests/${reqId}/status`, student, { status: 'Under Review' });
  assert(r.status === 403, 'student cannot change a request status');
  r = await call('PUT', `/api/requests/${reqId}/status`, admin, { status: 'Rejected' });
  assert(r.status === 400, 'Rejected is no longer an accepted document-request status');
  r = await call('PUT', `/api/requests/${reqId}/status`, admin, { status: 'Cancelled' });
  assert(r.status === 400, 'Cancelled is no longer an accepted document-request status');
  r = await call('PUT', `/api/requests/${reqId}/status`, admin,
    { status: 'Ready for Pickup', pickupDate: '2026-10-22', pickupTime: '08:45' });
  assert(r.status === 200, 'request scheduled for pickup again');
  r = await call('GET', '/api/notifications', student);
  assert(r.data.some(n => /claim it on/i.test(n.body)),
    'notification tells the student when the document can be claimed');
  r = await call('GET', '/api/qr/lookup?code=' + reqRef, student);
  assert(r.status === 200 && r.data.time === '08:45', 'QR lookup returns the pickup time');
  r = await call('PUT', `/api/requests/${reqId}/pickup`, admin, { date: '2026-10-24', time: '07:15' });
  assert(r.status === 200 && r.data.pickup_date === '2026-10-24' && r.data.pickup_time === '07:15',
    'admin edits the pickup schedule without touching the status');

  /* --- 24-hour claim window: scanning the request QR starts the clock --- */
  r = await call('POST', `/api/requests/${reqId}/claim`, student, {});
  assert(r.status === 403, 'student cannot start a claim window');
  r = await call('POST', `/api/requests/${reqId}/claim`, admin, {});
  assert(r.status === 200 && r.data.started === true && !!r.data.auto_complete_at,
    'admin scan starts the 24-hour claim window → auto-complete ' + (r.data.auto_complete_at || '?'));
  const claimedStamp = r.data.claimed_at;
  assert(!!claimedStamp, 'claim timestamp recorded');
  r = await call('POST', `/api/requests/${reqId}/claim`, admin, {});
  assert(r.status === 200 && r.data.started === false && r.data.claimed_at === claimedStamp,
    're-scanning does NOT restart the 24-hour clock');
  r = await call('GET', '/api/qr/lookup?code=' + reqRef, admin);
  assert(r.status === 200 && r.data.claimed_at === claimedStamp,
    'QR lookup reports when the request was scanned');
  r = await call('POST', '/api/requests/auto-complete', student, {});
  assert(r.status === 403, 'student cannot run the auto-complete sweep');

  /* backdate the claim past 24h → the sweep must complete it */
  {
    const path = require('path');
    const { DatabaseSync } = require('node:sqlite');
    const dbFile = path.isAbsolute(process.env.DB_PATH || '')
      ? process.env.DB_PATH
      : path.join(__dirname, process.env.DB_PATH || 'database/smart-registrar.db');
    const db = new DatabaseSync(dbFile);
    db.exec('PRAGMA busy_timeout = 5000;');
    db.prepare("UPDATE document_requests SET claimed_at=datetime('now','-25 hours') WHERE id=?").run(reqId);
    db.close();
  }
  r = await call('POST', '/api/requests/auto-complete', admin, {});
  assert(r.status === 200 && r.data.completed >= 1, 'sweep auto-completes the expired claim window');
  r = await call('GET', '/api/requests', admin);
  const autoRow = r.data.find(x => x.id === reqId);
  const backdatedClaim = autoRow.claimed_at;
  assert(autoRow.status === 'Completed', 'request auto-marked Completed after 24 hours');
  assert(autoRow.completed_at === backdatedClaim,
    'Completed time is the QR scan time, not the sweep time');
  r = await call('GET', '/api/notifications', student);
  assert(r.data.some(n => n.title === 'Request Completed' && /24-hour/i.test(n.body)),
    'student notified of the automatic completion');

  /* --- Completed freezes the pickup schedule --- */
  r = await call('PUT', `/api/requests/${reqId}/pickup`, admin, { date: '2026-10-25', time: '09:00' });
  assert(r.status === 409, 'completed request refuses pickup edits (409)');
  r = await call('PUT', `/api/requests/${reqId}/status`, admin, { status: 'Completed', pickupDate: '2026-10-26' });
  assert(r.status === 409, 'a status change cannot sneak a new pickup date onto a completed request');
  r = await call('GET', '/api/requests', admin);
  const frozen = r.data.find(x => x.id === reqId);
  assert(frozen.pickup_date === '2026-10-24' && frozen.pickup_time === '07:15',
    'the locked pickup schedule is untouched after the refused edits');

  /* manual completion still works — no scan, no timer required */
  r = await call('POST', '/api/requests', student, { docType: 'Good Moral', quantity: 1, purpose: 'Manual completion test' });
  assert(r.status === 201, 'second fixture request created');
  const reqManual = r.data.id;
  r = await call('PUT', `/api/requests/${reqManual}/status`, admin, { status: 'Completed' });
  assert(r.status === 200, 'admin may still press Completed manually (no QR scan needed)');
  r = await call('GET', '/api/requests', admin);
  const manualRow = r.data.find(x => x.id === reqManual);
  assert(!!manualRow.completed_at, 'manual completion records the time it was pressed');
  r = await call('PUT', `/api/requests/${reqManual}/pickup`, admin, { date: '2026-10-26', time: '10:00' });
  assert(r.status === 409, 'manually completed request is locked too');
  r = await call('POST', `/api/requests/${reqManual}/claim`, admin, {});
  assert(r.status === 200 && r.data.started === false && r.data.status === 'Completed',
    'scanning an already-completed request does nothing');

  /* --- advanced tracking: per-request timeline --- */
  r = await call('GET', `/api/requests/${reqId}/timeline`, student);
  assert(r.status === 200 && Array.isArray(r.data.events),
    'owner student can read the request timeline');
  {
    const tl = r.data.events;
    assert(tl.some(e => e.label === 'Request submitted'), 'timeline starts with the submission step');
    assert(tl.some(e => e.kind === 'scan'), 'timeline records the QR scan / claim window');
    assert(tl.some(e => e.kind === 'done'), 'timeline records the completion');
    {
      const doneEvt = tl.find(e => e.kind === 'done');
      assert(!!doneEvt && doneEvt.at === backdatedClaim,
        'timeline Completed step shows the QR scan time');
    }
    let chrono = true;
    for (let i = 1; i < tl.length; i++) if (String(tl[i - 1].at) > String(tl[i].at)) chrono = false;
    assert(chrono, 'timeline events are chronological (' + tl.length + ' steps)');
  }
  r = await call('GET', `/api/requests/${reqManual}/timeline`, admin);
  assert(r.status === 200 && r.data.ref, 'admin can read any request timeline');
  {
    const doneEvt = (r.data.events || []).find(e => e.kind === 'done');
    assert(!!doneEvt && doneEvt.at === manualRow.completed_at,
      'manual Completed step shows the exact time it was pressed');
  }
  r = await call('GET', '/api/requests/999999/timeline', admin);
  assert(r.status === 404, 'unknown request timeline → 404');
  /* a different student must not read someone else's history */
  const tlEmail = 'tl.reader.' + uniq + '@cdlshs.edu.ph';
  r = await call('POST', '/api/auth/register', null, {
    firstName: 'Timeline', lastName: 'Reader', email: tlEmail,
    password: 'other123', studentNumber: 'S-2026-Z' + uniq.toUpperCase().slice(-6),
    gradeLevel: '11', strand: 'STEM'
  });
  assert(r.status === 201 && r.data.devOtp, 'timeline reader student registered');
  r = await call('POST', '/api/auth/register/verify-otp', null, { email: tlEmail, otp: r.data.devOtp });
  assert(r.status === 201, 'timeline reader OTP verified');
  r = await call('POST', '/api/auth/login', null, { email: tlEmail, password: 'other123' });
  const tlTok = r.data.token;
  r = await call('GET', `/api/requests/${reqId}/timeline`, tlTok);
  assert(r.status === 403, 'another student cannot read a foreign timeline');

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
  assert(r.status === 403, 'admin cannot edit student info (403)');
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

  /* --- the registrar decides how many slots a time range makes --- */
  r = await call('POST', '/api/slots', admin, { date: '2026-12-27', startTime: '08:00', endTime: '09:00', count: 4 });
  assert(r.status === 201 && r.data.count === 4 && (r.data.ids || []).length === 4,
    'registrar sets the number of slots for a time range');
  r = await call('GET', '/api/slots/all', admin);
  const split = r.data.filter(s => s.date === '2026-12-27')
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  assert(split.length === 4, 'the time range became 4 slots');
  assert(split[0].start_time === '08:00' && split[0].end_time === '08:15' &&
    split[3].start_time === '08:45' && split[3].end_time === '09:00',
    'the 4 slots are split evenly (15 minutes each)');
  r = await call('POST', '/api/slots', admin, { date: '2026-12-27', startTime: '08:00', endTime: '09:00', count: 4 });
  assert(r.status === 409, 'creating the same slots twice is refused');
  r = await call('POST', '/api/slots', admin, { date: '2026-12-27', startTime: '10:00', endTime: '10:05', count: 10 });
  assert(r.status === 400, 'too many slots for a short range is refused');
  r = await call('POST', '/api/slots', admin, { date: '2026-12-27', startTime: '11:00', endTime: '12:00', count: 0 });
  assert(r.status === 400, 'zero slots is refused');
  for (const s of split) await call('DELETE', `/api/slots/${s.id}`, admin);

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

  /* --- request chat (messenger per request) --- */
  r = await call('POST', '/api/messages/' + reqId, student, { text: 'Kailan po ma-release?' });
  assert(r.status === 201 && r.data.sender_role === 'student', 'student sends message on request');
  const rqMsgId = r.data.id;
  r = await call('GET', '/api/messages/' + reqId, student);
  assert(r.status === 200 && r.data.request.ref === reqRef &&
    r.data.messages.some(m => m.id === rqMsgId), 'student reads thread history + meta');
  r = await call('GET', '/api/messages/unread-count', admin);
  assert(r.status === 200 && r.data.count >= 1, 'admin unread chat count (' + r.data.count + ')');
  r = await call('POST', '/api/messages/' + reqId, admin, { text: 'Processing na po, konting hintay lang.' });
  assert(r.status === 201 && r.data.sender_role === 'admin', 'admin replies in thread');
  r = await call('GET', '/api/notifications', student);
  assert(r.data.some(n => n.title.includes('Message from the Registrar')), 'student notified of admin chat message');
  r = await call('GET', '/api/messages/unread-count', student);
  assert(r.status === 200 && r.data.count >= 1 && r.data.latest_request_id === reqId,
    'student unread count + latest thread for popup');
  r = await call('POST', '/api/messages/' + reqId + '/read', student);
  assert(r.status === 200, 'student marks thread read');
  r = await call('GET', '/api/messages/unread-count', student);
  assert(r.data.count === 0, 'student unread cleared after read');
  r = await call('POST', '/api/messages/' + reqId + '/read', admin);
  r = await call('GET', '/api/messages/unread-count', admin);
  assert(r.data.count === 0, 'admin unread cleared after read');
  /* typing heartbeat + peer_typing flag */
  r = await call('POST', '/api/messages/' + reqId + '/typing', admin);
  assert(r.status === 200 && r.data.ok, 'admin typing heartbeat accepted');
  r = await call('GET', '/api/messages/' + reqId, student);
  assert(r.data.peer_typing === true, 'student sees peer_typing=true while admin types');
  r = await call('GET', '/api/messages/' + reqId, admin);
  assert(r.data.peer_typing === false, 'admin does not see self as typing');
  r = await call('POST', '/api/messages/' + reqId + '/typing', student);
  r = await call('GET', '/api/messages/' + reqId, admin);
  assert(r.data.peer_typing === true, 'admin sees peer_typing=true while student types');
  r = await call('POST', '/api/messages/' + reqId + '/typing', 'garbage.token');
  assert(r.status === 401, 'typing requires auth');
  r = await call('POST', '/api/messages/' + reqId, student, { text: '   ' });
  assert(r.status === 400, 'empty chat message rejected');
  r = await call('GET', '/api/messages/999999', student);
  assert(r.status === 404, 'unknown thread → 404');
  const otherEmail = 'other.chat.' + uniq + '@cdlshs.edu.ph';
  r = await call('POST', '/api/auth/register', null, {
    firstName: 'Other', lastName: 'Student', email: otherEmail,
    password: 'other123', studentNumber: 'S-2026-O' + uniq.toUpperCase().slice(-6),
    gradeLevel: '11', strand: 'STEM'
  });
  assert(r.status === 201 && r.data.devOtp, 'chat-observer student registered');
  r = await call('POST', '/api/auth/register/verify-otp', null, { email: otherEmail, otp: r.data.devOtp });
  assert(r.status === 201, 'chat-observer OTP verified');
  r = await call('POST', '/api/auth/login', null, { email: otherEmail, password: 'other123' });
  const observerTok = r.data.token;
  r = await call('GET', '/api/messages/' + reqId, observerTok);
  assert(r.status === 403, 'other student blocked from someone else\'s thread');
  r = await call('POST', '/api/messages/' + reqId, observerTok, { text: 'hello po' });
  assert(r.status === 403, 'other student cannot post into foreign thread');
  r = await call('POST', '/api/messages/' + reqId, student, { text: 'Thanks po!' });
  assert(r.status === 201, 'history persists for later messages (kahit matagal na)');
  r = await call('GET', '/api/messages/' + reqId, admin);
  assert(r.data.messages.length >= 3, 'thread history keeps all messages (' + r.data.messages.length + ')');

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
  assert(r.status === 200 && r.data.type === 'document_request' &&
    r.data.quantity === 2 && r.data.purpose === 'Enrollment' && r.data.name,
    'QR lookup request (requester, qty, purpose)');
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
  assert(!r.data.requestsByStatus.some(x => ['Rejected', 'Cancelled'].includes(x.status)),
    'reports exclude legacy rejected/cancelled requests');
  r = await call('GET', '/api/logs', admin);
  assert(r.status === 200 && r.data.length > 0, 'activity logs recorded');
  r = await call('GET', '/api/logs', student);
  assert(r.status === 403, 'student blocked from logs');

  /* --- activity log: search + filters + facets --- */
  r = await call('GET', '/api/logs?search=' + encodeURIComponent(reqRef), admin);
  assert(r.status === 200 && r.data.length > 0 && r.data.every(l =>
    (l.user_name + ' ' + l.action + ' ' + l.details).indexOf(reqRef) !== -1),
    'log search narrows to matching entries (' + r.data.length + ')');
  r = await call('GET', '/api/logs?action=SUBMIT_REQUEST', admin);
  assert(r.status === 200 && r.data.length > 0 &&
    r.data.every(l => l.action === 'SUBMIT_REQUEST'),
    'log action filter returns only that action');
  r = await call('GET', '/api/logs?search=no-such-entry-zzz', admin);
  assert(r.status === 200 && r.data.length === 0, 'log search with no matches → empty list');
  r = await call('GET', '/api/logs?from=2000-01-01&to=2100-01-01', admin);
  assert(r.status === 200 && r.data.length > 0, 'log date range keeps matching records');
  r = await call('GET', '/api/logs?from=2100-01-01', admin);
  assert(r.status === 200 && r.data.length === 0, 'log date range can exclude everything');
  r = await call('GET', '/api/logs/facets', admin);
  assert(r.status === 200 && Array.isArray(r.data.actions) && r.data.actions.length > 0 &&
    typeof r.data.total === 'number' && r.data.total > 0,
    'log facets list actions with counts (total ' + r.data.total + ')');
  r = await call('GET', '/api/logs/facets', student);
  assert(r.status === 403, 'student blocked from log facets');

  /* --- admin analytics dashboard --- */
  r = await call('GET', '/api/analytics', admin);
  assert(r.status === 200 && r.data.requests && r.data.appointments &&
    r.data.students && r.data.trends && r.data.top, 'analytics returns every KPI group');
  {
    const rq = r.data.requests;
    assert(rq.total >= 1 && rq.completionRate >= 0 && rq.completionRate <= 100,
      'analytics completion rate is a sane percentage (' + rq.completionRate + '%)');
    assert(typeof rq.avgTurnaroundH === 'number' && rq.avgTurnaroundH >= 0,
      'analytics average turnaround computed (' + rq.avgTurnaroundH + 'h)');
    assert(Array.isArray(r.data.trends.byWeekday) && r.data.trends.byWeekday.length >= 1,
      'analytics weekday trend present');
    assert(Array.isArray(r.data.top.documents) && r.data.top.documents.length >= 1,
      'analytics top documents present');
    assert(Array.isArray(r.data.students.byGrade) && r.data.students.byGrade.length >= 1,
      'analytics students-by-grade present');
    assert(typeof rq.underReview === 'number' && typeof rq.underReviewRate === 'number',
      'analytics reports Under Review instead of rejected');
    assert(rq.rejected === undefined && rq.rejectionRate === undefined,
      'analytics no longer exposes rejected/rejectionRate');
  }
  r = await call('GET', '/api/analytics', student);
  assert(r.status === 403, 'student blocked from analytics');

  /* --- enhanced QR verification verdicts --- */
  r = await call('GET', '/api/qr/lookup?code=' + reqRef, admin);
  assert(r.status === 200 && r.data.verify && r.data.verify.verdict === 'COMPLETED' &&
    !!r.data.verify.message, 'completed request verifies as COMPLETED');
  r = await call('GET', '/api/qr/lookup?code=' + apptRef, admin);
  assert(r.data.verify && r.data.verify.verdict === 'COMPLETED',
    'completed appointment verifies as COMPLETED');
  r = await call('GET', '/api/qr/lookup?code=STU-' + stuNum, admin);
  assert(r.data.verify && r.data.verify.verdict === 'VALID' && !!r.data.verify.message,
    'active student verifies as VALID with a message');
  /* open → claimed → completed (Rejected no longer exists) */
  r = await call('POST', '/api/requests', student,
    { docType: 'Form 137', quantity: 1, purpose: 'Verdict test' });
  assert(r.status === 201 && !!r.data.ref, 'verdict fixture request created');
  const vRef = r.data.ref, vId = r.data.id;
  r = await call('GET', '/api/qr/lookup?code=' + vRef, admin);
  assert(r.status === 200 && r.data.verify && r.data.verify.verdict === 'VALID',
    'open request verifies as VALID');
  r = await call('POST', `/api/requests/${vId}/claim`, admin, {});
  assert(r.status === 200 && r.data.started === true, 'verdict fixture claim window started');
  r = await call('GET', '/api/qr/lookup?code=' + vRef, admin);
  assert(r.data.verify && r.data.verify.verdict === 'IN_WINDOW' &&
    /auto-completes in/.test(r.data.verify.message),
    'claimed request verifies as IN_WINDOW with the time left');
  r = await call('PUT', `/api/requests/${vId}/status`, admin, { status: 'Completed' });
  assert(r.status === 200, 'verdict fixture completed');
  r = await call('GET', '/api/qr/lookup?code=' + vRef, admin);
  assert(r.data.verify && r.data.verify.verdict === 'COMPLETED',
    'completed request verifies as COMPLETED');

  /* --- P2: document requirements management --- */
  r = await call('GET', '/api/requests/types', admin);
  assert(r.status === 200 && r.data.length >= 5, 'admin sees every document type (' + r.data.length + ')');
  assert(!r.data.some(t => t.name === 'Diploma'), 'Diploma is retired from the document types');
  {
    const eo = r.data.find(t => t.name === 'Certificate of Enrollment');
    assert(!!eo && (eo.description || '').length > 10,
      'starter description pre-filled: ' + (eo ? String(eo.description).slice(0, 38) : '?'));
    assert(!!eo && /•/.test(eo.requirements || ''), 'starter requirements pre-filled');
    assert(!!eo && Number(eo.processing_days) >= 1, 'processing_days pre-filled');
  }
  r = await call('GET', '/api/requests/types', student);
  assert(r.status === 200 && r.data.length >= 5 && r.data.every(t => t.is_active === 1),
    'students only receive active types (' + r.data.length + ')');

  /* create (idempotent: a previous run may already own the row) */
  r = await call('POST', '/api/requests/types', admin, {
    name: 'P2 Test Type', description: 'Fixture requirements', requirements: '• Purpose\n• Valid ID',
    processing_days: 2
  });
  assert(r.status === 201 || r.status === 409, 'admin can create a document type (HTTP ' + r.status + ')');
  let p2Type = r.status === 201 ? r.data : null;
  if (!p2Type) {
    r = await call('GET', '/api/requests/types', admin);
    p2Type = (r.data || []).find(t => t.name === 'P2 Test Type');
  }
  assert(!!p2Type && !!p2Type.id, 'P2 test type row is present');
  r = await call('POST', '/api/requests/types', admin, { name: 'P2 Test Type' });
  assert(r.status === 409, 'duplicate document type rejected');
  r = await call('POST', '/api/requests/types', student, { name: 'Student-made type' });
  assert(r.status === 403, 'student cannot create document types');

  /* edit: same-day processing (0 must survive the clamp) */
  r = await call('PUT', `/api/requests/types/${p2Type.id}`, admin,
    { processing_days: 0, description: 'Updated P2 description' });
  assert(r.status === 200 && r.data.processing_days === 0 &&
    r.data.description === 'Updated P2 description',
    'admin edits same-day processing (0 kept) and description');
  r = await call('PUT', `/api/requests/types/${p2Type.id}`, student, { description: 'Hacked' });
  assert(r.status === 403, 'student cannot edit a document type');

  /* disable (never delete) */
  r = await call('PUT', `/api/requests/types/${p2Type.id}`, admin, { is_active: false });
  assert(r.status === 200 && r.data.is_active === 0, 'type disabled instead of deleted');
  r = await call('GET', '/api/requests/types', student);
  assert(r.status === 200 && !r.data.some(t => t.id === p2Type.id), 'disabled type hidden from students');
  r = await call('POST', '/api/requests', student, { docType: 'P2 Test Type', quantity: 1, purpose: 'disabled type' });
  assert(r.status === 400, 'requesting a disabled type is refused');
  r = await call('POST', '/api/requests', student, { docType: 'Form 137', quantity: 1, purpose: 'legacy type' });
  assert(r.status === 201, 'unknown legacy type still accepted (no regression)');
  r = await call('PUT', `/api/requests/types/${p2Type.id}`, admin, { is_active: true });
  assert(r.status === 200 && r.data.is_active === 1, 'type re-enabled for the next run');

  /* --- P2: digital queue --- */
  r = await call('GET', '/api/slots', student);
  const freeQ = (r.data || []).find(s => !s.is_booked);
  assert(!!freeQ, 'a free slot exists for the queue fixture');
  r = await call('POST', '/api/appointments', student,
    { slotId: freeQ.id, service: 'Certificate of Enrollment', purpose: 'Queue fixture' });
  assert(r.status === 201 && Number(r.data.queue_no) >= 1,
    'booking joins that day queue at #' + (r.data && r.data.queue_no));
  const qId = r.data.id, qDate = r.data.date;

  r = await call('GET', `/api/appointments/queue?date=${qDate}`, admin);
  assert(r.status === 200 && Array.isArray(r.data.rows) && r.data.rows.some(x => x.id === qId),
    'queue board lists the booking (' + r.data.waiting + ' waiting)');
  r = await call('GET', `/api/appointments/queue?date=${qDate}`, student);
  assert(r.status === 403, 'student cannot open the queue board');

  r = await call('POST', `/api/appointments/${qId}/call`, admin, {});
  assert(r.status === 200 && r.data.queue_state === 'serving', 'registrar calls the student (now serving)');
  r = await call('GET', `/api/appointments/queue?date=${qDate}`, admin);
  assert(r.data.serving && r.data.serving.id === qId, 'board shows who is now serving');
  r = await call('POST', `/api/appointments/${qId}/call`, student, {});
  assert(r.status === 403, 'student cannot call the queue');
  r = await call('POST', `/api/appointments/${qId}/served`, admin, {});
  assert(r.status === 200 && r.data.queue_state === 'served' && r.data.status === 'Completed',
    'served → queue done + appointment completed');

  /* no-show on a second booking */
  r = await call('GET', '/api/slots', student);
  const freeQ2 = (r.data || []).find(s => !s.is_booked);
  assert(!!freeQ2, 'a second free slot exists for the no-show fixture');
  r = await call('POST', '/api/appointments', student, { slotId: freeQ2.id, service: 'Other', purpose: 'No-show fixture' });
  assert(r.status === 201, 'second booking created for the no-show fixture');
  const nsId = r.data.id;
  r = await call('POST', `/api/appointments/${nsId}/noshow`, student, {});
  assert(r.status === 403, 'student cannot flag a no-show');
  r = await call('POST', `/api/appointments/${nsId}/noshow`, admin, {});
  assert(r.status === 200 && r.data.no_show === 1 && r.data.status === 'Cancelled',
    'no-show flagged + appointment cancelled');

  /* bulk approve */
  r = await call('POST', '/api/appointments/approve-all', admin, {});
  assert(r.status === 200 && typeof r.data.approved === 'number',
    'bulk approve returns a count (' + r.data.approved + ')');
  r = await call('POST', '/api/appointments/approve-all', student, {});
  assert(r.status === 403, 'student cannot bulk approve');

  /* --- P2: student feedback & ratings --- */
  r = await call('POST', '/api/feedback', student, { rating: 5, comment: 'Mabilis at maayos!' });
  assert(r.status === 201 && r.data.rating === 5, 'student sends 5-star feedback');
  r = await call('POST', '/api/feedback', student, { rating: 9 });
  assert(r.status === 400, 'rating above 5 refused');
  r = await call('POST', '/api/feedback', student, { rating: 0 });
  assert(r.status === 400, 'rating below 1 refused');
  r = await call('POST', '/api/feedback', admin, { rating: 5 });
  assert(r.status === 403, 'admin cannot post student feedback');
  r = await call('GET', '/api/feedback/mine', student);
  assert(r.status === 200 && r.data.length >= 1, 'student reads their own feedback');
  r = await call('GET', '/api/feedback', admin);
  assert(r.status === 200 && r.data.total >= 1 && r.data.avg >= 1 && r.data.avg <= 5 &&
    r.data.dist.length === 5, 'admin sees average + distribution (' + r.data.avg + '★, ' + r.data.total + ' ratings)');
  r = await call('GET', '/api/feedback', student);
  assert(r.status === 403, 'student cannot read every rating');
  r = await call('GET', '/api/analytics', admin);
  assert(r.status === 200 && r.data.feedback && r.data.feedback.total >= 1 && r.data.feedback.avg >= 1,
    'analytics carries the feedback KPI (' + r.data.feedback.total + ' @ ' + r.data.feedback.avg + ')');

  /* --- progress emails (dev mode: resolves without a provider, never blocks the API) --- */
  {
    const mailer = require('./server/mailer');
    assert(typeof mailer.sendStatusMail === 'function', 'mailer exposes sendStatusMail');
    assert(mailer.provider() === 'dev', 'mailer reports dev mode without credentials');
    assert(mailer.settings().provider === 'dev', 'mailer settings expose the active provider');
    const sent = await mailer.sendStatusMail('student@example.com',
      'Smart Registrar — test', ['hello']);
    assert(!!sent && (sent.dev === true || sent.sent === true),
      'sendStatusMail resolves in dev mode (no provider configured)');
    const skipped = await mailer.sendStatusMail('', 'no recipient', ['x']);
    assert(skipped && skipped.skipped === true, 'sendStatusMail skips an empty recipient');

    /* provider selection runs in a child process so the tests never touch the network */
    const { execFileSync } = require('child_process');
    const pick = extra => execFileSync(process.execPath, [
      '-e', "process.stdout.write(require('./server/mailer').provider())"
    ], { cwd: process.cwd(), env: Object.assign({}, process.env, extra), encoding: 'utf8' }).trim();

    assert(pick({ BREVO_API_KEY: 'test-key', MAIL_FROM: 'sender@example.com' }) === 'brevo',
      'Brevo is chosen when the API key + sender are present');
    const smtpEnv = { GMAIL_USER: 'sender@gmail.com', GMAIL_APP_PASSWORD: 'x'.repeat(16) };
    const smtpPick = execFileSync(process.execPath, [
      '-e', "process.stdout.write(require('./server/mailer').provider())"
    ], {
      cwd: process.cwd(),
      env: Object.assign({}, process.env, smtpEnv, { BREVO_API_KEY: '', MAIL_FROM: '' }),
      encoding: 'utf8'
    }).trim();
    assert(smtpPick === 'smtp', 'Gmail SMTP is used when Brevo is not configured');
  }

  /* --- status change still succeeds with the email hook (fire-and-forget) --- */
  r = await call('POST', '/api/requests', student,
    { docType: 'SF9', quantity: 1, purpose: 'Email hook test' });
  assert(r.status === 201, 'email-hook fixture request created');
  const mailReqId = r.data.id;
  r = await call('PUT', `/api/requests/${mailReqId}/status`, admin, { status: 'Processing' });
  assert(r.status === 200, 'Processing status change succeeds with the email hook');
  r = await call('PUT', `/api/requests/${mailReqId}/status`, admin,
    { status: 'Ready for Pickup', pickupDate: '2026-12-01', pickupTime: '09:00' });
  assert(r.status === 200, 'Ready for Pickup with a schedule succeeds with the email hook');
  r = await call('PUT', `/api/requests/${mailReqId}/pickup`, admin,
    { date: '2026-12-02', time: '10:30' });
  assert(r.status === 200, 'pickup schedule edit succeeds with the email hook');
  r = await call('POST', '/api/requests', student,
    { docType: 'SF10', quantity: 1, purpose: 'Appointment mail hook' });
  r = await call('GET', '/api/slots', student);
  const mailSlot = (r.data || []).find(s => !s.is_booked);
  r = await call('POST', '/api/appointments', student,
    { slotId: mailSlot.id, service: 'Other', purpose: 'Email hook test' });
  assert(r.status === 201, 'email-hook appointment created');
  const mailApptId = r.data.id;
  r = await call('PUT', `/api/appointments/${mailApptId}/status`, admin, { status: 'Approved' });
  assert(r.status === 200, 'appointment Approved succeeds with the email hook');

  /* --- notifications read --- */
  r = await call('PUT', '/api/notifications/read-all', student);
  assert(r.status === 200, 'mark all notifications read');
  r = await call('GET', '/api/notifications/unread-count', student);
  assert(r.status === 200 && r.data.count === 0, 'unread count is 0 after read-all');

  /* --- safety: login lockout --- */
  const lockEmail = 'lock.test.' + uniq + '@cdlshs.edu.ph';
  r = await call('POST', '/api/auth/register', null, {
    firstName: 'Lock', lastName: 'Tester', email: lockEmail,
    password: 'lock1234', studentNumber: 'S-2026-L' + uniq.toUpperCase().slice(-6),
    gradeLevel: '12', strand: 'STEM'
  });
  assert(r.status === 201 && r.data.devOtp, 'lockout test account register (OTP sent)');
  r = await call('POST', '/api/auth/register/verify-otp', null, { email: lockEmail, otp: r.data.devOtp });
  assert(r.status === 201, 'lockout test account OTP verified');
  for (let i = 0; i < 5; i++) {
    r = await call('POST', '/api/auth/login', null, { email: lockEmail, password: 'wrong-pass-' + i });
  }
  assert(r.status === 429, 'account locked after 5 failed logins');
  r = await call('POST', '/api/auth/login', null, { email: lockEmail, password: 'lock1234' });
  assert(r.status === 429, 'locked account rejected even with correct password');

  /* --- safety: change password (OTP flow) + session invalidation --- */
  r = await call('POST', '/api/auth/change-password/request-otp', student, { currentPassword: 'wrong', newPassword: 'newpass1' });
  assert(r.status === 400, 'change-password rejects wrong current password');
  r = await call('POST', '/api/auth/change-password/request-otp', student, { currentPassword: 'fix12345', newPassword: 'abc' });
  assert(r.status === 400, 'change-password rejects short new password');
  r = await call('POST', '/api/auth/change-password/request-otp', student, { currentPassword: 'fix12345', newPassword: 'newpass1' });
  assert(r.status === 200 && r.data.devOtp, 'change-password OTP sent (dev)');
  r = await call('POST', '/api/auth/change-password/verify-otp', student, { otp: r.data.devOtp });
  assert(r.status === 200 && r.data.token, 'change-password OTP verified, fresh token issued');
  const student2token = r.data.token;
  r = await call('GET', '/api/auth/me', student);
  assert(r.status === 401, 'old session invalidated after password change');
  r = await call('GET', '/api/auth/me', student2token);
  assert(r.status === 200, 'fresh token works after password change');
  r = await call('POST', '/api/auth/login', null, { email: stuEmail, password: 'fix12345' });
  assert(r.status === 401, 'old password no longer works');
  r = await call('POST', '/api/auth/login', null, { email: stuEmail, password: 'newpass1' });
  assert(r.status === 200, 'login works with the new password');
  const stuFresh = r.data.token;

  /* --- profile photo --- */
  r = await call('PUT', '/api/students/me/photo', stuFresh, { photo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' });
  assert(r.status === 200 && r.data.profile_photo, 'student uploads profile photo');
  r = await call('GET', '/api/auth/me', stuFresh);
  assert(r.status === 200 && r.data.student && r.data.student.profile_photo, 'photo visible in /me');
  r = await call('PUT', '/api/students/me/photo', stuFresh, { photo: 'not-an-image' });
  assert(r.status === 400, 'invalid photo rejected');
  r = await call('PUT', '/api/students/me/photo', admin, { photo: 'data:image/png;base64,AAA=' });
  assert(r.status === 403, 'admin cannot use student photo endpoint');

  /* --- safety: CSV export + backup --- */
  r = await call('GET', '/api/export/students', admin);
  assert(r.status === 200 && r.text.includes('student_number'), 'admin exports students CSV');
  r = await call('GET', '/api/export/requests', admin);
  assert(r.status === 200 && r.text.includes('pickup_date'), 'admin exports requests CSV');
  assert(r.text.includes('pickup_time'), 'admin CSV export includes the pickup time');
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
  r = await call('POST', '/api/auth/change-password/request-otp', stuFresh, { currentPassword: 'newpass1', newPassword: 'fix12345' });
  assert(r.status === 200 && r.data.devOtp, 'restore password OTP sent');
  r = await call('POST', '/api/auth/change-password/verify-otp', stuFresh, { otp: r.data.devOtp });
  assert(r.status === 200, 'password restored for next test run');
  r = await call('POST', '/api/auth/login', null, { email: stuEmail, password: 'fix12345' });
  assert(r.status === 200 && r.data.token, 'original login restored');

  /* --- forgot password (login screen, no session required) --- */
  const fpEmail = 'fp' + uniq + '@cdlshs.edu.ph';
  const fpNum = 'S-2026-F' + uniq.toUpperCase().slice(-6);
  /* unknown email → generic reply, never confirms whether an account exists */
  r = await call('POST', '/api/auth/forgot-password/request-otp', null, { email: 'ghost' + uniq + '@cdlshs.edu.ph' });
  assert(r.status === 200 && r.data.message && !r.data.devOtp,
    'forgot-password: unknown email gets a generic reply with no code');
  r = await call('POST', '/api/auth/forgot-password/verify-otp', null,
    { email: 'ghost' + uniq + '@cdlshs.edu.ph', otp: '111111', newPassword: 'fpReset1' });
  assert(r.status === 404, 'forgot-password: unknown email cannot be reset');
  /* make a real account, then reset it */
  r = await call('POST', '/api/auth/register', null, {
    firstName: 'Fp', lastName: 'Tester', email: fpEmail, password: 'fpTest12',
    studentNumber: fpNum, gradeLevel: '12', strand: 'STEM'
  });
  assert(r.status === 201 && r.data.devOtp, 'forgot-password fixture account registers');
  r = await call('POST', '/api/auth/register/verify-otp', null, { email: fpEmail, otp: r.data.devOtp });
  assert(r.status === 201, 'forgot-password fixture account created');
  r = await call('POST', '/api/auth/forgot-password/request-otp', null, { email: fpEmail });
  assert(r.status === 200 && r.data.devOtp, 'forgot-password: OTP sent (dev)');
  const fpOtp = r.data.devOtp;
  const badOtp = fpOtp === '111111' ? '222222' : '111111';
  /* weak password is refused without burning the code */
  r = await call('POST', '/api/auth/forgot-password/verify-otp', null, { email: fpEmail, otp: fpOtp, newPassword: 'short' });
  assert(r.status === 400 && r.data.error, 'forgot-password: weak password rejected');
  r = await call('POST', '/api/auth/forgot-password/verify-otp', null, { email: fpEmail, otp: fpOtp, newPassword: 'FixMe12' });
  assert(r.status === 400, 'forgot-password: 7-character password rejected');
  /* wrong code refused */
  r = await call('POST', '/api/auth/forgot-password/verify-otp', null, { email: fpEmail, otp: badOtp, newPassword: 'fpReset1' });
  assert(r.status === 400 && r.data.error, 'forgot-password: wrong OTP rejected');
  /* correct code + 8-char password → reset */
  r = await call('POST', '/api/auth/forgot-password/verify-otp', null, { email: fpEmail, otp: fpOtp, newPassword: 'fpReset1' });
  assert(r.status === 200 && r.data.message, 'forgot-password: password reset completed');
  r = await call('POST', '/api/auth/login', null, { email: fpEmail, password: 'fpTest12' });
  assert(r.status === 401, 'forgot-password: old password no longer works');
  r = await call('POST', '/api/auth/login', null, { email: fpEmail, password: 'fpReset1' });
  assert(r.status === 200 && r.data.token, 'forgot-password: new password logs in');
  const fpTok = r.data.token;

  /* --- per-role password length: student = exactly 8, admin = up to 12 --- */
  r = await call('POST', '/api/auth/change-password/request-otp', fpTok,
    { currentPassword: 'fpReset1', newPassword: 'nineChar1' });
  assert(r.status === 400 && /exactly 8/.test(r.data.error || ''),
    'student still capped at exactly 8 characters');
  r = await call('POST', '/api/auth/forgot-password/request-otp', null, { email: 'admin@cdlshs.edu.ph' });
  assert(r.status === 200 && r.data.devOtp, 'admin forgot-password OTP sent (dev)');
  r = await call('POST', '/api/auth/forgot-password/verify-otp', null,
    { email: 'admin@cdlshs.edu.ph', otp: r.data.devOtp, newPassword: 'registrar123' });
  assert(r.status === 200, 'admin may set a 12-character password');
  r = await call('POST', '/api/auth/login', null, { email: 'admin@cdlshs.edu.ph', password: 'registrar123' });
  assert(r.status === 200 && r.data.token, 'admin logs in with registrar123');
  admin = r.data.token;

  /* --- unknown route --- */
  r = await call('GET', '/api/nope', admin);
  assert(r.status === 404, 'unknown API route → JSON 404');

  /* --- app version (update notifier, public - no token) --- */
  r = await call('GET', '/api/app/version');
  assert(r.status === 200 && typeof r.data.version === 'string' && r.data.version.length > 0 &&
    r.data.updated_at, 'app version endpoint (public)');
  /* `mail` is a plain boolean — proves whether an email provider is configured
     without ever exposing a credential. Local runs are DEV mode. */
  assert(typeof r.data.mail === 'boolean',
    'app version reports email status as a boolean');
  assert(r.data.mail === false,
    'local test run has no email provider configured (OTP stays in DEV mode)');
  assert(r.data.provider === 'dev',
    'app version reports the active mail provider (dev)');
  /* per-variable presence, never the values themselves */
  assert(r.data.gmail && typeof r.data.gmail.user === 'boolean' &&
    typeof r.data.gmail.appPassword === 'boolean',
    'version reports Gmail variable presence as booleans');
  assert(r.data.gmail.user === false && r.data.gmail.appPassword === false,
    'local .env leaves both Gmail variables empty');
  assert(r.data.brevo && typeof r.data.brevo.apiKey === 'boolean' &&
    typeof r.data.brevo.from === 'boolean',
    'version reports Brevo variable presence as booleans');
  assert(r.data.brevo.apiKey === false && r.data.brevo.from === false,
    'local .env leaves both Brevo variables empty');
  assert(!('gmail_keys' in r.data),
    'no environment enumeration field on the public endpoint');
  /* only mail-ish names may appear, and only as identifier-like strings */
  assert(Array.isArray(r.data.gmail.matched) &&
    r.data.gmail.matched.every(n => /^[A-Za-z0-9_]+( <trailing-space>)?$/.test(n)),
    'mail matched entries are bare names, never values');
  assert(r.data.gmail.matched.length > 0,
    'local .env defines the email variable names (empty values still register as names)');

  /* --- Google sign-in fully removed: no config leak, no auth endpoints --- */
  r = await call('GET', '/api/app/config');
  assert(r.status === 404, 'app config endpoint removed (was only used for the Google button)');
  r = await call('POST', '/api/auth/google', null, { idToken: 'garbage.token.here' });
  assert(r.status === 404 && r.data.error, 'google sign-in endpoint removed');
  r = await call('POST', '/api/auth/google/complete', null, {
    tempToken: 'garbage', studentNumber: '999999999999', firstName: 'X', lastName: 'Y',
    gradeLevel: '11', strand: 'STEM', password: 'Passw0rd123'
  });
  assert(r.status === 404 && r.data.error, 'google profile completion endpoint removed');

  /* --- frontend served --- */
  const home = await fetch(BASE + '/');
  const html = await home.text();
  assert(home.status === 200 && html.includes('Smart Registrar'), 'frontend index.html served');

  /* leave the database example-free for the user */
  purge();

  console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
