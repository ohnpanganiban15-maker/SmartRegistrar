/* =====================================================
   test-frontend.js — loads the real frontend in jsdom,
   runs the real API against the live server, and walks
   through every screen + the pickup schedule flow.
   Run:  node test-frontend.js
===================================================== */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { purge } = require('./test-db');

const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
const assert = (c, msg) => { if (c) { pass++; console.log('PASS:', msg); } else { fail++; console.log('FAIL:', msg); process.exitCode = 1; } };

const pub = path.join(__dirname, 'public');
let html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
/* remove script tags — we eval them manually after stubbing fetch/QR */
html = html.replace(/<script src="[^"]*"><\/script>/g, '').replace(/<link[^>]*>/g, '');

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', e => { console.log('  [jsdomError]', e.message); });
virtualConsole.on('error', (...a) => { console.log('  [console.error]', ...a); });

const dom = new JSDOM(html, {
  url: BASE + '/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole
});
const w = dom.window;

/* fetch stub → real server (resolve relative URLs) — must exist before app.js runs */
w.fetch = (url, opts) => fetch(new URL(url, BASE), opts);
w.scrollTo = () => {};
if (!w.navigator.mediaDevices) w.navigator.mediaDevices = {};

/* inject the app files as REAL classic <script> tags so top-level
   const/let bindings share one global scope (exactly like a browser) */
function loadScript(content) {
  const s = w.document.createElement('script');
  s.textContent = content;
  w.document.body.appendChild(s);
}
const scripts = ['js/api.js', 'js/util.js', 'js/chat.js', 'js/views/student.js', 'js/views/admin.js'];
for (const s of scripts) loadScript(fs.readFileSync(path.join(pub, s), 'utf8'));

/* QRCode stub (real lib needs canvas which jsdom lacks) */
loadScript(`window.QRCode = function(el, opts){ if(el && opts) el.setAttribute('data-qr', opts.text); };
            window.QRCode.CorrectLevel = { M:0, L:1, Q:2, H:3 };`);

/* now the main app (boots on load) */
loadScript(fs.readFileSync(path.join(pub, 'js/app.js'), 'utf8'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const $app = () => w.document.getElementById('app').innerHTML;
const evalA = expr => w.eval(expr);

(async () => {
  /* start from a clean, example-free database */
  purge();
  /* guarantee one announcement so the dashboard panel check is stable
     (default seed does not create announcements) */
  {
    const { DatabaseSync } = require('node:sqlite');
    const dbFile = path.isAbsolute(process.env.DB_PATH || '')
      ? process.env.DB_PATH
      : path.join(__dirname, process.env.DB_PATH || 'database/smart-registrar.db');
    const db = new DatabaseSync(dbFile);
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec("DELETE FROM announcements WHERE title='Dashboard Panel Fixture'");
    db.prepare("INSERT INTO announcements (title, body) VALUES (?,?)")
      .run('Dashboard Panel Fixture', 'Fixture announcement for the dashboard panel test.');
    /* P2 fixture type: remove leftovers so the requirements-manager test starts clean */
    db.exec("DELETE FROM document_types WHERE name='FE Fixture Type'");
    db.close();
  }
  await sleep(400); /* let boot() finish */

  /* --- boot → login screen --- */
  assert(w.document.getElementById('li-email') !== null, 'app boots to login screen');

  /* --- Google sign-in must be fully removed from the login screen --- */
  assert(w.document.getElementById('gbtn') === null, 'login screen has no Google sign-in slot');
  assert(!$app().includes('or continue with'), 'login screen has no Google divider');
  assert(!$app().includes('Continue with Google'), 'login screen has no Google button');
  await sleep(80);
  assert($app().includes('Appointment'), 'login screen: appointment present in app name');

  /* --- fixture students (tests create their own data — no seed examples) --- */
  const u = Date.now().toString(36);
  const em1 = 'fix.one.' + u + '@cdlshs.edu.ph';
  const em2 = 'fix.two.' + u + '@cdlshs.edu.ph';
  const num1 = 'S-2026-F' + u.toUpperCase().slice(-6);
  const num2 = 'S-2026-G' + u.toUpperCase().slice(-6);
  const reg = async (first, last, email, num) => {
    const res = await fetch(BASE + '/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: first, lastName: last, email, password: 'fix12345', studentNumber: num, gradeLevel: '12', strand: 'STEM' })
    });
    if (res.status !== 201) return res.status;
    const data = await res.json();
    const v = await fetch(BASE + '/api/auth/register/verify-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp: data.devOtp })
    });
    return v.status;
  };
  assert(await reg('Alpha', 'Cabrera', em1, num1) === 201, 'fixture student A registers (OTP verified)');
  assert(await reg('Bravo', 'Testos', em2, num2) === 201, 'fixture student B registers (OTP verified)');

  /* --- show / hide password toggle --- */
  const passEl = w.document.getElementById('li-pass');
  const eyeBtn = w.document.querySelector('.pass-eye');
  assert(passEl && passEl.type === 'password', 'login password hidden by default');
  assert(!!eyeBtn, 'show-password eye button present');
  w.eval(`togglePass('li-pass', document.querySelector('.pass-eye'))`);
  assert(w.document.getElementById('li-pass').type === 'text', 'eye toggle reveals password');
  w.eval(`togglePass('li-pass', document.querySelector('.pass-eye'))`);
  assert(w.document.getElementById('li-pass').type === 'password', 'eye toggle hides password again');

  /* --- forgot password link lives on the login screen --- */
  assert($app().includes('Forgot password?'), 'login screen shows a Forgot password link');
  assert(w.document.getElementById('li-pass').getAttribute('maxlength') === '12',
    'login password input accepts up to 12 characters (admin may be longer)');
  await w.eval("go('forgotPassword')");
  await sleep(150);
  assert(!!w.document.getElementById('fp-email'), 'forgot-password step 1 asks for the email');
  assert($app().includes('Send reset code'), 'forgot-password step 1 has a send button');
  await w.eval("go('login')");
  await sleep(100);
  assert(w.document.getElementById('li-pass') !== null, 'back to login from forgot password');

  /* --- register: show-password eye + values preserved on error --- */
  await w.eval("go('register')");
  await sleep(120);
  assert(!!w.document.getElementById('rg-pass') &&
    !!w.document.querySelector('#rg-pass') , 'register form rendered');
  /* the eye is a sibling button inside .pass-wrap */
  assert(!!w.document.querySelector('.pass-wrap .pass-eye'), 'register password has eye toggle');
  assert(w.document.getElementById('rg-pass').getAttribute('maxlength') === '8',
    'register password input stops at 8 characters');
  w.document.getElementById('rg-num').value = '123456789012';
  w.document.getElementById('rg-email').value = 'preserve.test@cdlshs.edu.ph';
  w.document.getElementById('rg-first').value = 'Preserve';
  w.document.getElementById('rg-last').value = 'Tester';
  w.document.getElementById('rg-contact').value = '09171234567';
  w.document.getElementById('rg-pass').value = 'abc'; /* weak → client-side error, no network */
  await w.eval("doRegister({ preventDefault: () => {} })");
  await sleep(120);
  assert(w.document.getElementById('rg-email').value === 'preserve.test@cdlshs.edu.ph',
    'register keeps email after error re-render');
  assert(w.document.getElementById('rg-first').value === 'Preserve',
    'register keeps first name after error re-render');
  assert(w.document.getElementById('rg-num').value === '123456789012',
    'register keeps LRN after error re-render');
  assert(w.document.getElementById('rg-last').value === 'Tester',
    'register keeps last name after error re-render');
  /* back to the login screen for the normal flow below */
  await w.eval("go('login')");
  await sleep(80);

  /* --- failed login: keep the email, clear only the password --- */
  w.document.getElementById('li-email').value = em1;
  w.document.getElementById('li-pass').value = 'wrongpw1';
  await w.doLogin({ preventDefault: () => {} });
  await sleep(150);
  assert(!!w.document.querySelector('#app .form-error'), 'failed login shows an error message');
  assert(w.document.getElementById('li-pass') !== null,
    'failed login stays on the login screen');
  assert(w.document.getElementById('li-email').value === em1,
    'failed login keeps the typed email address');
  assert(w.document.getElementById('li-pass').value === '',
    'failed login clears the password field only');
  /* the remembered email must not leak into other screens */
  await w.eval("go('register')");
  await sleep(80);
  await w.eval("go('login')");
  await sleep(80);
  assert(w.document.getElementById('li-email').value === '',
    'stale email is dropped after navigating away from login');

  /* --- a rejected OTP must not erase what the user already typed --- */
  await w.eval("state.otpPurpose='register'; state.otpEmail='no.such.user@cdlshs.edu.ph'; go('otp')");
  await sleep(150);
  assert(!!w.document.getElementById('otp-code'), 'OTP screen rendered');
  w.document.getElementById('otp-code').value = '123456';
  await w.eval("doVerifyRegisterOtp({ preventDefault: () => {} })");
  await sleep(250);
  assert(!!w.document.querySelector('#app .form-error'), 'wrong OTP shows an error message');
  assert(w.document.getElementById('otp-code') !== null,
    'OTP screen stays after a rejected code');
  assert(w.document.getElementById('otp-code').value === '123456',
    'OTP screen keeps the typed code after an error');
  /* the remembered code must not leak into a later visit */
  await w.eval("go('login')");
  await sleep(100);
  assert(w.eval("state.otpCode") === '',
    'stale OTP code is dropped after leaving the OTP screen');
  await w.eval("go('otp')");
  await sleep(120);
  assert(w.document.getElementById('otp-code').value === '',
    'reopened OTP screen starts empty');
  await w.eval("go('login')");
  await sleep(80);

  /* --- a failed password reset must not wipe the form --- */
  await w.eval("state.forgot={ email:'no.such.user@cdlshs.edu.ph', step:2 }; go('forgotPassword')");
  await sleep(150);
  assert(!!w.document.getElementById('fp-otp'), 'forgot-password step 2 rendered');
  w.document.getElementById('fp-otp').value = '654321';
  w.document.getElementById('fp-new').value = 'abc';
  w.document.getElementById('fp-confirm').value = 'abc';
  await w.eval("doForgotVerifyOtp({ preventDefault: () => {} })");
  await sleep(200);
  assert(!!w.document.querySelector('#app .form-error'), 'weak reset password shows an error');
  assert(w.document.getElementById('fp-otp').value === '654321',
    'reset form keeps the typed OTP after a client-side error');
  assert(w.document.getElementById('fp-new').value === 'abc',
    'reset form keeps the new password after a client-side error');
  assert(w.document.getElementById('fp-confirm').value === 'abc',
    'reset form keeps the confirmation after a client-side error');
  /* the same guarantee when the SERVER rejects the submission */
  w.document.getElementById('fp-otp').value = '111111';
  w.document.getElementById('fp-new').value = 'abcdefgh1';
  w.document.getElementById('fp-confirm').value = 'abcdefgh1';
  await w.eval("doForgotVerifyOtp({ preventDefault: () => {} })");
  await sleep(350);
  assert(!!w.document.querySelector('#app .form-error'), 'unknown account shows an error');
  assert(w.document.getElementById('fp-otp').value === '111111',
    'reset form keeps the typed OTP after a server rejection');
  assert(w.document.getElementById('fp-new').value === 'abcdefgh1',
    'reset form keeps the new password after a server rejection');
  assert(w.document.getElementById('fp-confirm').value === 'abcdefgh1',
    'reset form keeps the confirmation after a server rejection');
  /* the draft must not leak either */
  await w.eval("go('login')");
  await sleep(100);
  assert(w.eval("!(state.forgot && state.forgot.draft)"),
    'reset draft is dropped after leaving the forgot-password screen');

  /* --- student login --- */
  w.document.getElementById('li-email').value = em1;
  w.document.getElementById('li-pass').value = 'fix12345';
  await w.doLogin({ preventDefault: () => {} });
  await sleep(100);
  assert(!$app().includes('Quick Actions'), 'student dashboard: Quick Actions removed');
  assert(!$app().includes('Book an Appointment'), 'student dashboard: booking buttons removed');
  assert($app().includes('Announcements'), 'student dashboard: announcements panel kept');
  assert($app().includes('Next Pickup Schedule') || $app().includes('No pickup schedule'),
    'student dashboard: pickup schedule shown');
  assert($app().includes('id-card') && $app().includes('LRN'),
    'student dashboard: identity card with LRN shown');
  assert($app().includes('Grade'), 'student dashboard: grade level shown');
  assert(w.document.querySelector('.brand-sub') &&
    w.document.querySelector('.brand-sub').textContent.includes('Appointments'),
    'brand subtitle includes appointments');

  /* --- request chat (messenger popup) --- */
  assert(typeof w.eval('Chat.openThread') === 'function' && typeof w.eval('Chat.poll') === 'function',
    'chat component loaded (openThread + poll)');
  w.eval('Chat.ensure()');
  assert(w.document.getElementById('chat-win') !== null &&
    w.document.getElementById('chat-head') !== null,
    'chat popup window + chat head in DOM');
  assert(String(w.eval('viewMyRequests')).includes('Chat.openThread'),
    'student My Requests has Chat button');
  assert(String(w.eval('viewAdminRequests')).includes('Chat.openThread'),
    'admin Requests table has Chat button');
  w.eval('Chat.close()');
  assert(w.document.getElementById('chat-win').hidden === true, 'chat popup closes');
  /* the real visibility fix is CSS: [hidden]{display:none!important} must beat
     .chat-win/.chat-badge display:flex — asserted via the style sheet below */
  assert(fs.readFileSync(path.join(pub, 'css/style.css'), 'utf8')
    .includes('[hidden] { display:none !important; }'),
    'chat CSS lets [hidden] override display:flex (window + badge actually hide)');

  /* --- chat typing indicator + read receipts --- */
  w.eval('Chat.ensure()');
  assert(w.document.getElementById('chat-typing') !== null,
    'chat typing indicator element present');
  w.eval("Chat.paintTyping(true)");
  assert(w.document.getElementById('chat-typing').hidden === false, 'paintTyping(true) shows indicator');
  w.eval("Chat.paintTyping(false)");
  assert(w.document.getElementById('chat-typing').hidden === true, 'paintTyping(false) hides indicator');
  /* read receipt: my (student) message shows ✓✓; peer message shows none */
  w.eval("Chat.paint([{ sender_role:'student', body:'hi', created_at:'2026-10-23 10:00:00', read_admin:0 }])");
  assert(!!w.document.querySelector('.chat-msg.mine .tick'),
    'read-receipt tick rendered on my (unread) message');
  assert(!w.document.querySelector('.chat-msg.theirs'), 'my message shown as mine');
  w.eval("Chat.paint([{ sender_role:'student', body:'hi', created_at:'2026-10-23 10:00:00', read_admin:1 }])");
  assert(!!w.document.querySelector('.chat-msg.mine .tick.read'),
    'tick turns to "read" once the peer read flag is set');
  w.eval("Chat.paint([{ sender_role:'admin', body:'yo', created_at:'2026-10-23 10:00:00', read_student:0 }])");
  assert(!!w.document.querySelector('.chat-msg.theirs'), 'peer message rendered as theirs');
  assert(!w.document.querySelector('.chat-msg .tick'), 'no read tick on peer message');
  /* source-level wiring */
  assert(fs.readFileSync(path.join(pub, 'js/chat.js'), 'utf8').includes('peer_typing'),
    'chat client reads peer_typing flag');
  assert(fs.readFileSync(path.join(pub, 'js/chat.js'), 'utf8').includes('Chat.typing()'),
    'chat input sends typing heartbeat');
  assert(fs.readFileSync(path.join(__dirname, 'server/routes/messages.js'), 'utf8').includes('/typing'),
    'backend typing endpoint present');

  /* --- cycle every student view --- */
  const studentViews = ['availability', 'myRequests', 'myAppointments', 'notifications',
    'service', 'myQr', 'profile', 'announcements', 'assistant', 'dashboard'];
  for (const v of studentViews) {
    await w.eval(`go('${v}')`);
    await sleep(150);
    const htmlNow = $app();
    assert(htmlNow.length > 800 && !htmlNow.includes('Display error'),
      'view renders: ' + v + ' (' + htmlNow.length + ' chars)');
  }

  /* --- virtual registrar assistant: knowledge-base answers --- */
  await w.eval(`go('assistant')`);
  await sleep(150);
  assert($app().includes('Virtual Registrar Assistant'), 'assistant screen renders');
  assert(w.document.getElementById('asst-input') !== null, 'assistant has a text input');
  assert(w.document.querySelectorAll('.asst-chips .chip').length >= 4,
    'assistant offers quick-question chips');
  evalA(`assistantAsk('How do I track my request?')`);
  await sleep(80);
  {
    const msgs = w.document.querySelectorAll('#asst-thread .asst-msg');
    assert(msgs.length === 2 && /History/.test(msgs[1].textContent),
      'assistant answers a tracking question from its knowledge base');
    assert(!!w.document.querySelector('#asst-thread .asst-msg.me'),
      'the user question is rendered as my own message');
    assert(!!w.document.querySelector('#asst-thread .asst-msg .btn'),
      'the answer carries a shortcut action button');
  }
  evalA(`assistantAsk('zzqqxxvvbbnn mmkkjjhhgg')`);
  await sleep(80);
  {
    const msgs = w.document.querySelectorAll('#asst-thread .asst-msg');
    const last = msgs[msgs.length - 1];
    assert(/not sure about that one/i.test(last.textContent),
      'unknown question falls back to the help message');
    assert(/Talk to a person/i.test(last.textContent),
      'fallback offers the human Customer Service route');
  }
  /* the form input drives the same flow */
  w.document.getElementById('asst-input').value = 'What do I need to request a document?';
  evalA(`assistantSend({ preventDefault: () => {} })`);
  await sleep(80);
  assert(/Form 137|LRN|purpose/i.test(w.document.getElementById('asst-thread').textContent),
    'typed questions reach the assistant through the form');
  assert(w.document.getElementById('asst-input').value === '',
    'the assistant input clears after sending');

  /* --- P2: request form shows the document requirements --- */
  await w.eval(`go('myRequests')`);
  await sleep(200);
  evalA(`openRequestForm()`);
  await sleep(80);
  {
    const info = w.document.getElementById('rf-info');
    assert(!!info && info.textContent.includes('Processing:'), 'request form renders the requirements panel');
    assert(/What you need|Purpose|ID/i.test(info.textContent), 'requirements panel lists what the student needs');
    const sel = w.document.getElementById('rf-type');
    assert(sel.options.length >= 5, 'document type dropdown lists every offered type (' + sel.options.length + ')');
    /* switching the type refreshes the panel with that type's content */
    sel.value = 'Certified True Copy';
    evalA(`showReqInfo()`);
    await sleep(50);
    assert(/Certified True Copy|certified/i.test(w.document.getElementById('rf-info').textContent) &&
      w.document.getElementById('rf-info').textContent.includes('Processing:'),
      'changing the document type updates the requirements panel');
  }
  evalA(`closeModal()`);

  /* --- P2: student feedback modal (stars + validation) --- */
  await w.eval(`go('dashboard')`);
  await sleep(200);
  assert($app().includes('Rate now'), 'dashboard offers the Rate-now feedback panel');
  evalA(`openFeedback()`);
  await sleep(80);
  assert(w.document.getElementById('fb-stars') !== null &&
    w.document.querySelectorAll('#fb-stars .star').length === 5,
    'feedback modal renders 5 stars');
  evalA(`submitFeedback()`);
  await sleep(80);
  assert(/Pick a star rating first/.test(w.document.getElementById('fb-error').textContent),
    'submitting without a rating shows a validation error');
  evalA(`pickStar(4)`);
  await sleep(30);
  assert(w.document.querySelectorAll('#fb-stars .star.on').length === 4,
    'picking 4 stars highlights exactly 4');
  w.document.getElementById('fb-comment').value = 'Frontend feedback test — mabilis!';
  evalA(`submitFeedback()`);
  await sleep(300);
  assert(w.document.getElementById('fb-stars') === null, 'feedback modal closes after a valid submit');
  {
    const mine = await w.eval(`Api.get('/api/feedback/mine')`);
    assert(Array.isArray(mine) && mine.length >= 1 &&
      mine.some(f => f.rating === 4 && /Frontend feedback test/.test(f.comment)),
      'the 4-star rating is persisted for this student');
  }

  /* --- pickup schedule (read-only, no booking) --- */
  await w.eval(`go('availability')`);
  await sleep(200);
  assert($app().includes('Pickup Schedule'), 'student sees pickup schedule page');
  assert(!$app().includes('Confirm Booking') && !$app().includes('pickSlot('),
    'schedule page has no booking UI');

  /* --- customer service: send inquiry --- */
  await w.eval(`go('service')`);
  await sleep(200);
  w.document.getElementById('ch-subject').value = 'Frontend test question';
  w.document.getElementById('ch-body').value = 'Does the chat work?';
  await w.eval(`sendChat()`);
  await sleep(250);
  assert($app().includes('Frontend test question'), 'inquiry appears in student chat list');

  /* --- student books an appointment (used later by the QR lookup test) --- */
  const slotsArr = await w.eval(`Api.get('/api/slots')`);
  const freeSlotF = (slotsArr || []).find(s => !s.is_booked);
  assert(!!freeSlotF, 'free slot available for QR test');
  const apptF = await w.eval(`Api.post('/api/appointments',{slotId:${freeSlotF.id},service:'Certificate of Enrollment',purpose:'Frontend QR test'})`);
  assert(!!apptF && /^APT-\d{4}$/.test(apptF.ref), 'fixture appointment booked → ' + (apptF && apptF.ref));

  /* a document request the admin will schedule a pickup for */
  const reqF = await w.eval(`Api.post('/api/requests',{docType:'Form 137',quantity:1,purpose:'Pickup schedule test'})`);
  assert(!!reqF && /^REQ-\d{4}$/.test(reqF.ref), 'fixture document request created → ' + (reqF && reqF.ref));

  /* --- logout / admin login --- */
  w.eval(`logout()`);
  await sleep(100);
  w.document.getElementById('li-email').value = 'admin@cdlshs.edu.ph';
  w.document.getElementById('li-pass').value = 'registrar123';
  await w.doLogin({ preventDefault: () => {} });
  await sleep(250);
  assert($app().includes('Registrar Dashboard'), 'admin dashboard renders after login');
  assert(/\d{4}-\d{2}/.test($app()) && $app().includes('Semester'),
    'admin dashboard: school year + semester context shown');

  /* --- cycle every admin view --- */
  const adminViews = ['adminStudents', 'adminAppointments', 'adminRequests', 'adminAvailability',
    'adminScanner', 'adminAnnouncements', 'adminService', 'adminReports', 'adminAnalytics',
    'adminDocTypes', 'adminQueue', 'adminLogs', 'adminDashboard'];
  for (const v of adminViews) {
    await w.eval(`go('${v}')`);
    await sleep(200);
    const htmlNow = $app();
    assert(htmlNow.length > 800 && !htmlNow.includes('Display error'),
      'admin view renders: ' + v + ' (' + htmlNow.length + ' chars)');
  }

  /* --- admin: appointment approve shown, reject removed --- */
  await w.eval(`go('adminAppointments')`);
  await sleep(200);
  assert($app().includes('Approve'), 'admin appointments: approve button shown for pending');
  assert(!$app().includes('Reject</button>'), 'admin appointments: reject button removed');

  /* --- P2: improved appointments (bulk approve, queue column, no-show) --- */
  assert($app().includes('Approve all pending'), 'appointments head offers one-tap bulk approval');
  assert($app().includes('Queue board'), 'appointments head links to the digital queue board');
  assert(!!$app().match(/<th>Queue<\/th>/), 'appointments table has a Queue column');
  assert($app().includes('markNoShow('), 'active appointments offer a no-show action');

  /* --- P2: digital queue board (call → served) --- */
  assert(!!apptF && apptF.date, 'queue fixture appointment carries its date');
  await w.eval(`setQueueDate('${apptF.date}')`);
  await sleep(350);
  assert($app().includes('NOW SERVING'), 'queue board renders the Now Serving panel');
  assert($app().includes(apptF.ref), 'queue board lists the booking for that date');
  assert($app().includes('waiting'), 'queue board shows the waiting counter');
  evalA(`queueAction(${apptF.id}, 'call')`);
  await sleep(400);
  assert(!$app().includes('Nobody called yet'), 'calling flips the Now Serving panel to the student');
  assert($app().includes('Now serving'), 'called row is stamped Now serving');
  assert(!!w.document.querySelector('tr.row-serving'), 'the serving row is highlighted');
  evalA(`queueAction(${apptF.id}, 'served')`);
  await sleep(400);
  {
    const list = await w.eval(`Api.get('/api/appointments')`);
    const row = list.find(a => a.id === apptF.id);
    assert(!!row && row.queue_state === 'served' && row.status === 'Completed',
      'served marks the queue done + appointment completed');
  }

  /* --- P2: requirements manager (create → edit → disable → student blocked) --- */
  await w.eval(`go('adminDocTypes')`);
  await sleep(300);
  assert($app().includes('Document Requirements'), 'requirements manager renders');
  assert($app().includes('Certificate of Enrollment'), 'requirements table lists existing types');
  assert($app().includes('Processing'), 'requirements table shows the processing column');
  evalA(`openTypeForm()`);
  await sleep(60);
  assert(w.document.getElementById('dt-name') !== null, 'add-type modal opens');
  assert(w.document.getElementById('dt-fee') === null, 'add-type modal no longer asks for a fee');
  w.document.getElementById('dt-name').value = 'FE Fixture Type';
  w.document.getElementById('dt-desc').value = 'Frontend fixture document';
  w.document.getElementById('dt-req').value = '• Purpose of request\n• Valid school ID';
  w.document.getElementById('dt-days').value = '3';
  evalA(`saveType(null)`);
  await sleep(450);
  assert($app().includes('FE Fixture Type'), 'new document type appears in the table');
  assert(!$app().includes('<th>Fee</th>'), 'requirements table has no Fee column');
  {
    const list = await w.eval(`Api.get('/api/requests/types')`);
    const t = list.find(x => x.name === 'FE Fixture Type');
    assert(!!t && Number(t.processing_days) === 3 && t.is_active === 1,
      'created type persisted with processing days');
    /* edit it */
    evalA(`openTypeForm(${t.id})`);
    await sleep(60);
    w.document.getElementById('dt-days').value = '5';
    evalA(`saveType(${t.id})`);
    await sleep(450);
    const after = (await w.eval(`Api.get('/api/requests/types')`)).find(x => x.id === t.id);
    assert(!!after && Number(after.processing_days) === 5, 'edited processing days saved');
    /* disable (never delete) */
    evalA(`toggleType(${t.id})`);
    await sleep(450);
    assert($app().includes('FE Fixture Type'), 'disabled type stays visible to the registrar');
    assert(!!w.document.querySelector('tr.row-off'), 'disabled row is greyed out');
    const disabled = (await w.eval(`Api.get('/api/requests/types')`)).find(x => x.id === t.id);
    assert(!!disabled && disabled.is_active === 0, 'type disabled instead of deleted');
    /* re-enable so the row leaves a clean state */
    evalA(`toggleType(${t.id})`);
    await sleep(450);
    const re = (await w.eval(`Api.get('/api/requests/types')`)).find(x => x.id === t.id);
    assert(!!re && re.is_active === 1, 'type re-enabled');
  }

  /* --- P2: approve-all uses the pending fixture path --- */
  await w.eval(`go('adminAppointments')`);
  await sleep(250);
  evalA(`approveAllAppts()`);
  await sleep(450);
  {
    const list = await w.eval(`Api.get('/api/appointments')`);
    assert(list.every(a => a.status !== 'Pending'), 'no pending appointment survives approve-all');
  }

  /* --- P2: analytics feedback panel (rating submitted by the student earlier) --- */
  await w.eval(`go('adminAnalytics')`);
  await sleep(450);
  assert($app().includes('Student feedback'), 'analytics renders the feedback panel');
  assert(w.document.querySelectorAll('.fb-bar').length === 5,
    'feedback distribution shows all 5 star levels');
  {
    const avgEl = w.document.querySelector('.fb-avg b');
    const avg = avgEl ? parseFloat(avgEl.textContent) : 0;
    assert(avg >= 1 && avg <= 5, 'feedback average rendered (' + avg + ')');
    assert($app().includes('Frontend feedback test'), 'latest comments carry the real comment');
  }

  /* --- admin: search filter keeps rendering --- */
  await w.eval(`go('adminStudents')`);
  await sleep(200);
  evalA(`filterStudentsSearch('${num1}')`);
  await sleep(50);
  assert($app().includes('Cabrera') && !$app().includes('Testos'),
    'student search filters list client-side');

  /* --- admin: student add form opens --- */
  evalA(`openStudentForm()`);
  await sleep(50);
  assert(w.document.getElementById('sf-num') !== null, 'student add modal opens');
  evalA(`closeModal()`);

  /* --- admin: scanner + manual lookup --- */
  await w.eval(`go('adminScanner')`);
  await sleep(150);
  w.document.getElementById('scan-code').value = apptF.ref;
  await w.eval(`lookupCode()`);
  await sleep(250);
  assert($app().includes(apptF.ref) && $app().includes('Sensitive student details'),
    'manual QR lookup shows transaction details');
  assert(!!w.document.querySelector('#scan-result .verify-badge'),
    'QR lookup renders a verification verdict badge');
  assert(/VALID|EXPIRED|COMPLETED|INVALID|IN_WINDOW/.test(
    w.document.getElementById('scan-result').textContent),
    'verdict code is shown to the registrar');

  /* --- admin: pickup schedule management UI --- */
  await w.eval(`go('adminAvailability')`);
  await sleep(200);
  assert($app().includes('Pickup Schedule') && $app().includes('Add a slot') &&
    $app().includes('Close whole day'),
    'pickup schedule management UI present');

  /* --- admin: "Ready for Pickup" must collect date + time --- */
  const isoPlus = n => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  };
  const day3 = isoPlus(3), day5 = isoPlus(5);
  const rowOf = async id => (await w.eval(`Api.get('/api/requests')`)).find(x => x.id === id);

  await w.eval(`go('adminRequests')`);
  await sleep(250);
  assert($app().includes('editPickup'), 'admin requests table offers a pickup schedule cell');
  assert($app().includes('status-select') &&
    $app().includes('setReqStatus(' + reqF.id + ', this.value)'),
    'admin changes a request status with one clear dropdown');
  assert(/<option value="Under Review"/.test($app()),
    'the status dropdown offers Under Review');
  assert(!/setReqStatus\([^)]*'Rejected'/.test($app()) &&
    !/setReqStatus\([^)]*'Cancelled'/.test($app()) &&
    !$app().includes('>Rejected</option>') && !$app().includes('>Cancelled</option>'),
    'admin has no reject or cancel action for document requests');
  assert(!$app().includes('>Rejected</option>') && !$app().includes('>Cancelled</option>'),
    'the request status filter lists only the five live statuses');
  evalA(`setReqStatus(${reqF.id}, 'Ready for Pickup')`);
  await sleep(60);
  assert(w.document.getElementById('pk-date') !== null,
    'choosing Ready for Pickup opens the pickup scheduler');
  assert(w.document.getElementById('pk-time') !== null,
    'the scheduler also asks for a pickup time');
  /* both fields are required */
  w.document.getElementById('pk-date').value = '';
  evalA(`window.__pickupSubmit()`);
  await sleep(40);
  assert(w.document.getElementById('pk-date') !== null,
    'an empty pickup date is refused — scheduler stays open');
  assert(/date/i.test(w.document.getElementById('pk-hint').textContent),
    'the scheduler explains the date is required');
  w.document.getElementById('pk-date').value = day3;
  w.document.getElementById('pk-time').value = '';
  evalA(`window.__pickupSubmit()`);
  await sleep(40);
  assert(w.document.getElementById('pk-time') !== null,
    'an empty pickup time is refused — scheduler stays open');
  /* supply both → saved */
  w.document.getElementById('pk-time').value = '09:30';
  evalA(`window.__pickupSubmit()`);
  await sleep(500);
  assert(w.document.getElementById('pk-date') === null,
    'scheduler closes once date + time are supplied');
  {
    const row = await rowOf(reqF.id);
    assert(!!row && row.status === 'Ready for Pickup', 'request marked Ready for Pickup');
    assert(!!row && row.pickup_date === day3 && row.pickup_time === '09:30',
      'pickup date + time stored on the request');
    assert($app().includes('9:30 AM'), 'admin table shows the claim time in 12-hour form');
  }
  /* cancelling the scheduler must leave the status untouched */
  evalA(`setReqStatus(${reqF.id}, 'Processing')`);
  await sleep(300);
  evalA(`setReqStatus(${reqF.id}, 'Ready for Pickup')`);
  await sleep(60);
  assert(w.document.getElementById('pk-date') !== null, 'scheduler reopens for another change');
  evalA(`closeModal()`);
  await sleep(60);
  assert((await rowOf(reqF.id)).status === 'Processing', 'closing the scheduler cancels the status change');
  /* edit the schedule from the table without touching the status */
  evalA(`editPickup(${reqF.id})`);
  await sleep(60);
  assert(w.document.getElementById('pk-date') !== null, 'table pickup cell reopens the scheduler');
  w.document.getElementById('pk-date').value = day5;
  w.document.getElementById('pk-time').value = '14:00';
  evalA(`window.__pickupSubmit()`);
  await sleep(500);
  {
    const row3 = await rowOf(reqF.id);
    assert(!!row3 && row3.pickup_time === '14:00', 'edited pickup time saved');
    assert(!!row3 && row3.status === 'Processing', 'editing the schedule keeps the status');
  }
  /* finish the flow: mark it ready carrying the edited schedule */
  evalA(`setReqStatus(${reqF.id}, 'Ready for Pickup')`);
  await sleep(60);
  w.document.getElementById('pk-date').value = day5;
  w.document.getElementById('pk-time').value = '14:00';
  evalA(`window.__pickupSubmit()`);
  await sleep(500);
  assert((await rowOf(reqF.id)).status === 'Ready for Pickup',
    'request finally marked ready with the edited schedule');

  /* --- QR scan starts the 24-hour claim window --- */
  const reqCode = (await rowOf(reqF.id)).ref;
  await w.eval(`go('adminScanner')`);
  await sleep(250);
  w.document.getElementById('scan-code').value = reqCode;
  evalA(`lookupCode()`);
  await sleep(700);
  {
    const res = w.document.getElementById('scan-result');
    const txt = res ? res.textContent : '';
    assert(/24-hour claim window started/i.test(txt),
      'scanning the request QR starts the 24-hour claim window');
    assert(/auto-completes/i.test(txt), 'scanner shows when the request auto-completes');
    const row = await rowOf(reqF.id);
    assert(!!row && !!row.claimed_at, 'claim timestamp saved on the request');
  }
  const stamp1 = (await rowOf(reqF.id)).claimed_at;
  evalA(`lookupCode()`);
  await sleep(700);
  {
    const res = w.document.getElementById('scan-result');
    const txt = res ? res.textContent : '';
    assert(/claim window running/i.test(txt), 'second scan reports the window already running');
    assert(/IN_WINDOW/.test(txt), 'second scan verdict flips to IN_WINDOW');
    assert((await rowOf(reqF.id)).claimed_at === stamp1,
      'second scan does not restart the 24-hour clock');
  }
  await w.eval(`go('adminRequests')`);
  await sleep(300);
  assert(/auto-complete/.test($app()), 'requests table shows the auto-complete countdown');
  assert($app().includes('editPickup'), 'a ready request still offers the editable pickup cell');

  /* --- admin: activity log search / filter / print --- */
  await w.eval(`go('adminLogs')`);
  await sleep(300);
  assert(w.document.getElementById('lg-search') !== null, 'activity log has a search box');
  assert($app().includes('All actions'), 'activity log has an action filter');
  assert($app().includes('QR_CLAIM_SCAN'), 'the QR scan from this run is in the log');
  evalA(`setLogFilter('action', 'QR_CLAIM_SCAN')`);
  await sleep(350);
  {
    const cells = [...w.document.querySelectorAll('.rtable tbody tr')]
      .map(tr => tr.textContent);
    assert(cells.length > 0 && cells.every(t => t.includes('QR_CLAIM_SCAN')),
      'action filter narrows the table (' + cells.length + ' rows)');
  }
  evalA(`setLogFilter('search', 'zzz-no-such-entry')`);
  await sleep(350);
  assert($app().includes('No entries match these filters.'),
    'an unmatched search shows the empty state');
  evalA(`clearLogFilter()`);
  await sleep(350);
  assert(w.document.querySelectorAll('.rtable tbody tr').length > 0,
    'clearing filters restores the full log');
  evalA(`printLogs()`);
  await sleep(120);
  {
    const pa = w.document.getElementById('print-area');
    const txt = pa ? pa.textContent : '';
    assert(!!pa && /System Activity Log/.test(txt) && /Entries:/.test(txt),
      'printLogs fills the print sheet with the log');
    assert(!!pa && pa.querySelector('.sheet-table'),
      'the printable log is a proper table');
  }

  /* --- admin: analytics dashboard --- */
  await w.eval(`go('adminAnalytics')`);
  await sleep(400);
  assert($app().includes('Analytics') && $app().includes('Completion rate'),
    'analytics KPI cards render');
  assert(w.document.querySelectorAll('.rate-ring').length >= 3,
    'analytics shows the performance rate rings');
  assert($app().includes('Requests by weekday') && $app().includes('Most requested documents'),
    'analytics charts render');

  /* --- admin: printable reports --- */
  await w.eval(`go('adminReports')`);
  await sleep(300);
  assert($app().includes('Printable reports'), 'reports page offers printable sheets');
  await w.eval(`printReport('requests')`);
  await sleep(400);
  {
    const pa = w.document.getElementById('print-area');
    const txt = pa ? pa.textContent : '';
    assert(!!pa && /Document Requests Report/.test(txt),
      'printable requests report generated');
    assert(!!pa && txt.includes(reqF.ref), 'the report carries the real request rows');
  }
  await w.eval(`printReport('summary')`);
  await sleep(500);
  {
    const pa = w.document.getElementById('print-area');
    const txt = pa ? pa.textContent : '';
    assert(/Registrar Summary/.test(txt) && /Completion rate|Completed/.test(txt),
      'printable summary report generated from live analytics');
  }

  /* --- theme toggle + persistence --- */
  evalA(`toggleTheme()`);
  await sleep(50);
  assert(w.document.documentElement.getAttribute('data-theme') === 'dark', 'dark mode activates');
  assert(w.localStorage.getItem('cdlshs_theme') === 'dark', 'theme saved to localStorage');
  evalA(`toggleTheme()`);
  await sleep(50);
  assert(w.document.documentElement.getAttribute('data-theme') === 'light', 'back to light mode');

  /* --- admin logout returns to login --- */
  w.eval(`logout()`);
  await sleep(100);
  assert(w.document.getElementById('li-email') !== null, 'logout returns to login screen');

  /* --- student sees exactly WHEN the admin said the document can be claimed --- */
  w.document.getElementById('li-email').value = em1;
  w.document.getElementById('li-pass').value = 'fix12345';
  await w.doLogin({ preventDefault: () => {} });
  await sleep(300);
  await w.eval(`go('myRequests')`);
  await sleep(250);
  assert($app().includes('Under Review'),
    'student request filters include Under Review');
  assert(!$app().includes('cancelRequest('),
    'student can no longer cancel a document request');
  assert(!$app().includes('Rejected'),
    'student tracking shows no Rejected label');
  {
    const note = w.document.querySelector('.pickup-note');
    assert(!!note, 'student sees a ready-for-pickup note on the request');
    const wantDate = evalA(`fmtDate('${day5}')`);
    const wantTime = evalA(`fmtTime('14:00')`);
    assert(!!note && note.textContent.includes(wantDate),
      'note shows the claim date (' + wantDate + ')');
    assert(!!note && note.textContent.includes(wantTime),
      'note shows the claim time (' + wantTime + ')');
  }

  /* --- advanced tracking: the student expands the request timeline --- */
  {
    const histBtn = w.document.getElementById('tl-btn-' + reqF.id);
    assert(!!histBtn, 'student request card offers a History button');
    await w.eval(`toggleTimeline(${reqF.id}, document.getElementById('tl-btn-${reqF.id}'))`);
    await sleep(200);
    const box = w.document.getElementById('tl-' + reqF.id);
    const txt = box ? box.textContent : '';
    assert(!!box && /Request submitted/.test(txt), 'timeline shows the submission step');
    assert(/QR scanned/i.test(txt), 'timeline shows the QR scan / claim window step');
    assert(!!box && box.querySelectorAll('.tl-item').length >= 3,
      'timeline lists every recorded step (' + (box ? box.querySelectorAll('.tl-item').length : 0) + ')');
    /* collapse it again */
    await w.eval(`toggleTimeline(${reqF.id}, document.getElementById('tl-btn-${reqF.id}'))`);
    await sleep(150);
    assert(w.document.getElementById('tl-' + reqF.id).innerHTML === '',
      'history collapses on the second tap');
  }
  w.eval(`logout()`);
  await sleep(120);

  /* --- Completed freezes the pickup schedule (admin) --- */
  w.document.getElementById('li-email').value = 'admin@cdlshs.edu.ph';
  w.document.getElementById('li-pass').value = 'registrar123';
  await w.doLogin({ preventDefault: () => {} });
  await sleep(300);
  await w.eval(`go('adminRequests')`);
  await sleep(300);
  evalA(`setReqStatus(${reqF.id}, 'Completed')`);
  await sleep(500);
  {
    const row = await rowOf(reqF.id);
    assert(!!row && row.status === 'Completed', 'admin may still press Completed manually');
    assert($app().includes('pickup-locked'), 'completed request shows a locked pickup cell');
    assert(!$app().includes('editPickup(' + reqF.id + ')'),
      'the completed row has no edit button left');
    const err = await w.eval(`Api.put('/api/requests/${reqF.id}/pickup',
      { date: '2027-01-01', time: '10:00' }).then(() => '', e => e.message)`);
    assert(/locked/i.test(String(err)), 'API refuses pickup edits on a completed request → ' + err);
    const still = await rowOf(reqF.id);
    assert(still.pickup_date === day5 && still.pickup_time === '14:00',
      'the locked pickup date + time are untouched');
  }
  /* the registrar opens the same history as a modal */
  evalA(`showTimeline(${reqF.id})`);
  await sleep(700);
  {
    const body = w.document.getElementById('tl-modal');
    const txt = body ? body.textContent : '';
    assert(!!body && /Request submitted/.test(txt), 'admin timeline modal renders the history');
    assert(/QR scanned/i.test(txt), 'admin timeline shows the QR scan step');
    assert(/Completed/.test(txt), 'admin timeline shows the completion step');
    evalA(`closeModal()`);
    await sleep(100);
    assert(w.document.getElementById('tl-modal') === null, 'timeline modal closes');
  }
  w.eval(`logout()`);
  await sleep(120);

  /* --- app update notifier (banner shown when server build differs) --- */
  assert(evalA(`typeof AppUpdate`) === 'object', 'AppUpdate notifier present');
  evalA(`AppUpdate.show('testver')`);
  await sleep(50);
  const updBar = w.document.getElementById('update-bar');
  assert(updBar !== null, 'update banner renders');
  assert(updBar !== null && updBar.innerHTML.includes('Update') && updBar.innerHTML.includes('testver'),
    'update banner shows version + update button');
  evalA(`AppUpdate.dismiss()`);
  assert(w.document.getElementById('update-bar') === null, 'update banner dismissable');

  /* --- idle auto-logout --- */
  assert(evalA('IDLE_MS') === 15 * 60000, 'idle timeout defaults to 15 minutes');
  assert(evalA('_idleTimer') === null, 'no idle timer while signed out');
  w.document.getElementById('li-email').value = em1;
  w.document.getElementById('li-pass').value = 'fix12345';
  await w.doLogin({ preventDefault: () => {} });
  await sleep(250);
  assert(evalA('!!state.me'), 'idle test: signed in');
  assert(evalA('_idleTimer') !== null, 'idle timer arms once a session exists');
  /* shrink the window and let it lapse */
  evalA('IDLE_MS = 250; resetIdleTimer()');
  await sleep(800);
  assert(w.document.getElementById('li-email') !== null,
    'idle auto-logout returns to the login screen');
  assert(evalA('state.me === null'), 'idle auto-logout clears the session');
  assert(evalA('_idleTimer') === null, 'idle timer disarmed after signing out');
  {
    const t = w.document.getElementById('toast-root');
    assert(!!t && /inactivity/i.test(t.textContent),
      'idle auto-logout explains why the user was signed out');
  }
  /* restore the real window so nothing else fires early */
  evalA('IDLE_MS = 15 * 60000');

  /* leave the database example-free for the user */
  purge();

  console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
  w.close();
  process.exit(process.exitCode || 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
