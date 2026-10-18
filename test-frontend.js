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
const scripts = ['js/api.js', 'js/util.js', 'js/views/student.js', 'js/views/admin.js'];
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
  await sleep(400); /* let boot() finish */

  /* --- boot → login screen --- */
  assert(w.document.getElementById('li-email') !== null, 'app boots to login screen');
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
      body: JSON.stringify({ firstName: first, lastName: last, email, password: 'fix1234', studentNumber: num, gradeLevel: '12', strand: 'STEM' })
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

  /* --- student login --- */
  w.document.getElementById('li-email').value = em1;
  w.document.getElementById('li-pass').value = 'fix1234';
  await w.doLogin({ preventDefault: () => {} });
  await sleep(100);
  assert(!$app().includes('Quick Actions'), 'student dashboard: Quick Actions removed');
  assert(!$app().includes('Book an Appointment'), 'student dashboard: booking buttons removed');
  assert($app().includes('Announcements'), 'student dashboard: announcements panel kept');
  assert($app().includes('Next Pickup Schedule') || $app().includes('No pickup schedule'),
    'student dashboard: pickup schedule shown');
  assert(w.document.querySelector('.brand-sub') &&
    w.document.querySelector('.brand-sub').textContent.includes('Appointments'),
    'brand subtitle includes appointments');

  /* --- cycle every student view --- */
  const studentViews = ['availability', 'myRequests', 'myAppointments', 'notifications',
    'service', 'myQr', 'profile', 'announcements', 'dashboard'];
  for (const v of studentViews) {
    await w.eval(`go('${v}')`);
    await sleep(150);
    const htmlNow = $app();
    assert(htmlNow.length > 800 && !htmlNow.includes('Display error'),
      'view renders: ' + v + ' (' + htmlNow.length + ' chars)');
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

  /* --- logout / admin login --- */
  w.eval(`logout()`);
  await sleep(100);
  w.document.getElementById('li-email').value = 'admin@cdlshs.edu.ph';
  w.document.getElementById('li-pass').value = 'admin123';
  await w.doLogin({ preventDefault: () => {} });
  await sleep(250);
  assert($app().includes('Registrar Dashboard'), 'admin dashboard renders after login');

  /* --- cycle every admin view --- */
  const adminViews = ['adminStudents', 'adminAppointments', 'adminRequests', 'adminAvailability',
    'adminScanner', 'adminAnnouncements', 'adminService', 'adminReports', 'adminLogs', 'adminDashboard'];
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

  /* --- admin: pickup schedule management UI --- */
  await w.eval(`go('adminAvailability')`);
  await sleep(200);
  assert($app().includes('Pickup Schedule') && $app().includes('Add a slot') &&
    $app().includes('Close whole day'),
    'pickup schedule management UI present');

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

  /* leave the database example-free for the user */
  purge();

  console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
  w.close();
  process.exit(process.exitCode || 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
