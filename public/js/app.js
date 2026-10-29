/* =====================================================
   app.js — state, router, navigation shells,
   and every action handler (login, booking, CRUD…)
===================================================== */

const state = {
  view: 'login',
  loading: false,
  error: '',
  me: null,
  stats: {},
  slots: [], appts: [], requests: [], notifs: [], chats: [],
  anns: [], students: [], logs: [], reports: [], docTypes: [],
  book: { service: '', date: '', slotId: null, startTime: '', purpose: '' },
  confirmed: null,
  apptFilter: '', reqFilter: '', chatFilter: '',
  studentFilter: { search: '', grade: '', status: '' },
  apptAdminFilter: { search: '', status: '', from: '', to: '' },
  reqAdminFilter: { search: '', status: '' },
  unread: 0,
  pendingReq: 0,
  sidebarOpen: false,
  otpPurpose: '', otpEmail: '', devOtp: '',
  appConfig: null,
  gp: null
};

const VIEWS = {
  login: viewLogin, register: viewRegister, googleProfile: viewGoogleProfile, otp: viewOtp, changePassword: viewChangePassword, dashboard: viewDashboard,
  availability: viewAvailability, apptConfirmed: viewApptConfirmed,
  myAppointments: viewMyAppointments, myRequests: viewMyRequests,
  notifications: viewNotifications, service: viewService, myQr: viewMyQr,
  profile: viewProfile, announcements: viewAnnouncements,
  adminDashboard: viewAdminDashboard, adminStudents: viewAdminStudents,
  adminAppointments: viewAdminAppointments, adminRequests: viewAdminRequests,
  adminAvailability: viewAdminAvailability, adminScanner: viewAdminScanner,
  adminAnnouncements: viewAdminAnnouncements, adminService: viewAdminService,
  adminLogs: viewAdminLogs, adminReports: viewAdminReports
};

function isAdminView(v) { return String(v).startsWith('admin'); }

/* ---------- theme ---------- */
function isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
function toggleTheme() {
  document.documentElement.setAttribute('data-theme', isDark() ? 'light' : 'dark');
  try { localStorage.setItem('cdlshs_theme', isDark() ? 'dark' : 'light'); } catch (e) {}
  render();
}
function themeBtnHTML() {
  return '<button class="icon-btn" onclick="toggleTheme()" title="Toggle dark / light mode" aria-label="Toggle theme">' +
    (isDark() ? '☀' : '🌙') + '</button>';
}

/* ---------- data loading per view ---------- */
async function loadView(view) {
  switch (view) {
    case 'login': case 'register': case 'otp': case 'changePassword': case 'googleProfile': return;
    case 'dashboard': {
      const [stats, appts, slots, anns] = await Promise.all([
        Api.get('/api/dashboard/stats'), Api.get('/api/appointments'),
        Api.get('/api/slots'), Api.get('/api/announcements')]);
      Object.assign(state, { stats, appts, slots, anns });
      await updateUnread(); return;
    }
    case 'availability': {
      state.slots = await Api.get('/api/slots'); return;
    }
    case 'myAppointments':
      state.appts = await Api.get('/api/appointments'); return;
    case 'myRequests': {
      const [requests, docTypes] = await Promise.all([
        Api.get('/api/requests'), Api.get('/api/requests/types')]);
      state.requests = requests; state.docTypes = docTypes; return;
    }
    case 'notifications':
      state.notifs = await Api.get('/api/notifications');
      await updateUnread(); return;
    case 'service': {
      const [chats, anns] = await Promise.all([
        Api.get('/api/chat'), Api.get('/api/announcements')]);
      state.chats = chats; state.anns = anns; return;
    }
    case 'myQr': {
      const [appts, requests] = await Promise.all([
        Api.get('/api/appointments'), Api.get('/api/requests')]);
      state.appts = appts; state.requests = requests; return;
    }
    case 'profile':
      state.me = await Api.get('/api/auth/me'); return;
    case 'announcements':
      state.anns = await Api.get('/api/announcements'); return;
    case 'adminDashboard': {
      const [stats, slots, reports] = await Promise.all([
        Api.get('/api/dashboard/stats'), Api.get('/api/slots/all'), Api.get('/api/reports')]);
      Object.assign(state, { stats, slots, reports });
      await updateUnread(); return;
    }
    case 'adminStudents':
      state.students = await Api.get('/api/students'); return;
    case 'adminAppointments':
      state.appts = await Api.get('/api/appointments'); return;
    case 'adminRequests':
      state.requests = await Api.get('/api/requests'); return;
    case 'adminAvailability':
      state.slots = await Api.get('/api/slots/all'); return;
    case 'adminScanner': return;
    case 'adminAnnouncements':
      state.anns = await Api.get('/api/announcements'); return;
    case 'adminService':
      state.chats = await Api.get('/api/chat'); return;
    case 'adminLogs':
      state.logs = await Api.get('/api/logs'); return;
    case 'adminReports':
      state.reports = await Api.get('/api/reports'); return;
    case 'apptConfirmed': return;
  }
}

/* ---------- navigation ---------- */
async function go(view, patch) {
  if (!state.me && view !== 'login' && view !== 'register' && view !== 'otp' && view !== 'googleProfile') view = 'login';
  if (state.me && state.me.role !== 'admin' && isAdminView(view)) view = 'dashboard';
  if (patch) Object.assign(state, patch);
  state.view = view;
  state.error = '';
  state.loading = true;
  state.sidebarOpen = false;
  window.scrollTo(0, 0);
  render();
  try { await loadView(view); } catch (e) { state.error = e.message; }
  state.loading = false;
  render();
}

/* ---------- render ---------- */
let _restoreFocusId = null;
function render() {
  const app = document.getElementById('app');
  if (state.view === '__setup') { app.innerHTML = viewSetup(); return; }
  if (state.view === 'login') {
    app.innerHTML = viewLogin();
    maybeInitGoogle();
    return;
  }
  if (state.view === 'register') { app.innerHTML = viewRegister(); restoreFormValues(); return; }
  if (state.view === 'googleProfile') { app.innerHTML = viewGoogleProfile(); restoreFormValues(); return; }
  if (state.view === 'otp') { app.innerHTML = viewOtp(); return; }

  const viewFn = VIEWS[state.view] || VIEWS.dashboard;
  let content;
  if (state.loading) content = loadingHTML();
  else {
    content = (state.error ? errorBox(state.error) : '') + safeView(viewFn);
  }

  if (state.me && state.me.role === 'admin') app.innerHTML = adminShell(content);
  else app.innerHTML = studentShell(content);

  syncBottomNav();
  syncSidebar();

  /* restore caret when a filter input re-rendered */
  if (_restoreFocusId) {
    const el = document.getElementById(_restoreFocusId);
    if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} }
    _restoreFocusId = null;
  }
  paintUnread();
  postRender();
  if (typeof Chat !== 'undefined') Chat.paintBadge();
}
function safeView(fn) {
  try { return fn(); } catch (e) { console.error(e); return errorBox('Display error: ' + e.message); }
}

function postRender() {
  if (state.view === 'apptConfirmed' && state.confirmed) {
    renderQrInto('qr-target', state.confirmed.ref);
  }
  if (state.view === 'myQr' && state.me) {
    const num = (state.me.student && state.me.student.student_number) || state.me.id;
    renderQrInto('qr-stu', 'STU-' + num);
  }
  restoreFormValues();
}

/* re-fill auth form fields after an error re-render (so nothing is lost) */
function _setFormVal(id, v) { const el = document.getElementById(id); if (el && v != null) el.value = v; }
function restoreFormValues() {
  const f = state.form || {};
  if (state.view === 'register' && f.rg) {
    const g = f.rg;
    _setFormVal('rg-num', g.studentNumber);
    _setFormVal('rg-email', g.email);
    _setFormVal('rg-first', g.firstName);
    _setFormVal('rg-last', g.lastName);
    _setFormVal('rg-middle', g.middleName);
    _setFormVal('rg-contact', g.contact);
    _setFormVal('rg-pass', g.password);
    _setFormVal('rg-grade', g.gradeLevel);
    _setFormVal('rg-strand', g.strandSel);
    if (typeof toggleTvSpec === 'function') toggleTvSpec();
    if (g.strandSel === 'TVL/TechPro') _setFormVal('rg-spec', g.spec);
  }
  if (state.view === 'googleProfile' && f.gp) {
    const g = f.gp;
    _setFormVal('gp-num', g.studentNumber);
    _setFormVal('gp-first', g.firstName);
    _setFormVal('gp-last', g.lastName);
    _setFormVal('gp-middle', g.middleName);
    _setFormVal('gp-contact', g.contact);
    _setFormVal('gp-pass', g.password);
    _setFormVal('gp-grade', g.gradeLevel);
    _setFormVal('gp-strand', g.strandSel);
    if (typeof gpToggleSpec === 'function') gpToggleSpec();
    if (g.strandSel === 'TVL/TechPro') _setFormVal('gp-spec', g.spec);
  }
  if (state.view === 'changePassword' && f.cp) {
    _setFormVal('cp-current', f.cp.currentPassword);
    _setFormVal('cp-new', f.cp.newPassword);
    _setFormVal('cp-confirm', f.cp.confirm);
  }
}

/* ---------- shells ---------- */
function studentShell(content) {
  const unread = state.unread;
  const cur = state.view;
  const nav = [
    ['dashboard', '⌂', 'Home'], ['availability', '▦', 'Schedule'],
    ['myRequests', '▤', 'Requests'], ['notifications', '🔔', 'Alerts'], ['profile', '☺', 'Profile']
  ];
  return `
  <div class="shell student">
    <header class="topbar">
      <div class="brand">
        <div class="brand-logo"><img src="assets/logo.jpg" alt="CDLSHS logo"></div>
        <div><div class="brand-name">CDLSHS Smart Registrar</div>
        <div class="brand-sub">Appointments &amp; Documents</div></div>
      </div>
      <nav class="topbar-nav">
        ${nav.map(([v, ic, lb]) => `
          <a class="${cur === v ? 'active' : ''}" onclick="go('${v}')" href="javascript:void(0)">${lb}</a>`).join('')}
      </nav>
      <div class="topbar-actions">
        <button class="icon-btn" onclick="go('myQr')" title="My QR code">▣</button>
        <button class="icon-btn" onclick="askLogout()" title="Log out">↩</button>
      </div>
    </header>
    <main class="content">${content}</main>
    <nav class="bottom-nav" data-navkey="student">
      <span class="nav-pill" aria-hidden="true"></span>
      ${nav.map(([v, ic, lb]) => `
        <a data-view="${v}" class="${cur === v ? 'active' : ''}" onclick="go('${v}')" href="javascript:void(0)">
          <span class="ic">${ic}${v === 'notifications' ? `<span class="badge-dot pill-count"${unread ? '' : ' style="display:none"'}>${unread > 9 ? '9+' : unread}</span>` : ''}</span>${lb}</a>`).join('')}
    </nav>
  </div>`;
}

function adminShell(content) {
  const cur = state.view;
  const items = [
    ['adminDashboard', '⌂', 'Dashboard'], ['adminStudents', '👥', 'Students'],
    ['adminRequests', '▤', 'Requests'],
    ['adminAvailability', '◔', 'Pickup Schedule'], ['adminScanner', '▣', 'QR Scanner'],
    ['adminAnnouncements', '📢', 'Announcements'], ['adminService', '✉', 'Customer Service'],
    ['adminReports', '📊', 'Reports'], ['adminLogs', '≡', 'Activity Logs']
  ];
  const openChats = (state.chats || []).filter(m => m.status === 'Open').length;
  const mobileNav = [
    ['adminDashboard', '⌂', 'Home'], ['adminStudents', '👥', 'Students'],
    ['adminRequests', '▤', 'Requests'], ['adminAvailability', '◔', 'Schedule'],
    ['__menu', '☰', 'Menu']
  ];
  return `
  <div class="shell admin">
    ${state.sidebarOpen ? '<div class="sidebar-scrim" onclick="toggleSidebar()"></div>' : ''}
    <aside class="sidebar ${state.sidebarOpen ? 'open' : ''}">
      <div class="brand">
        <div class="brand-logo"><img src="assets/logo.jpg" alt="CDLSHS logo"></div>
        <b>CDLSHS<br>Registrar Admin</b>
      </div>
      <div class="side-items" data-navkey="admin-side">
        <span class="side-pill" aria-hidden="true"></span>
        ${items.map(([v, ic, lb]) => `
          <button data-view="${v}" class="side-item ${cur === v ? 'active' : ''}" onclick="go('${v}')">
            <span class="ic">${ic}</span>${lb}
            ${v === 'adminService' ? `<span class="side-badge" data-count="chats"${openChats ? '' : ' style="display:none"'}>${openChats > 9 ? '9+' : openChats}</span>` : ''}
            ${v === 'adminRequests' ? `<span class="side-badge" data-count="pending"${state.pendingReq ? '' : ' style="display:none"'}>${state.pendingReq > 9 ? '9+' : state.pendingReq}</span>` : ''}
          </button>`).join('')}
        <button class="side-item" onclick="askLogout()"><span class="ic">↩</span>Log out</button>
      </div>
      <div class="side-foot">Smart Registrar v1.0 · LAN mode</div>
    </aside>
    <div class="admin-main">
      <header class="topbar">
        <button class="icon-btn only-mobile" onclick="toggleSidebar()" title="Menu">☰</button>
        <div class="brand"><div class="brand-name">CDLSHS Smart Registrar</div></div>
        <div class="topbar-actions">
          <button class="icon-btn" onclick="go('notifications')" title="Notifications">🔔
            ${state.unread ? `<span class="badge-dot pill-count">${state.unread > 9 ? '9+' : state.unread}</span>` : ''}</button>
          <span class="admin-user">
            <span class="avatar">${((state.me?state.me.name:'').match(/\b\w/g)||['?']).slice(0,2).join('').toUpperCase()}</span>
            <span class="admin-user-name">${esc(state.me ? state.me.name : '')}</span>
          </span>
          ${themeBtnHTML()}
        </div>
      </header>
      <main class="content">${content}</main>
    </div>
    <nav class="bottom-nav" data-navkey="admin">
      <span class="nav-pill" aria-hidden="true"></span>
      ${mobileNav.map(([v, ic, lb]) => v === '__menu'
        ? `<a href="javascript:void(0)" onclick="toggleSidebar()"><span class="ic">${ic}</span>${lb}</a>`
        : `<a data-view="${v}" class="${cur === v ? 'active' : ''}" onclick="go('${v}')" href="javascript:void(0)">
            <span class="ic">${ic}${v === 'adminRequests' ? `<span class="badge-dot pill-count"${state.pendingReq ? '' : ' style="display:none"'}>${state.pendingReq > 9 ? '9+' : state.pendingReq}</span>` : ''}</span>${lb}</a>`).join('')}
    </nav>
  </div>`;
}

function toggleSidebar() { state.sidebarOpen = !state.sidebarOpen; render(); }

/* ---------- bottom-nav sliding pill ----------
   The nav node is reused across renders (same tabs) so the pill element
   survives the DOM rebuild and can slide smoothly between tabs. */
let _navCache = null;

function placeNavPill(nav, instant) {
  const pill = nav && nav.querySelector('.nav-pill');
  const active = nav && nav.querySelector('a.active');
  if (!pill || !active) return;
  const x = active.offsetLeft + (active.offsetWidth - pill.offsetWidth) / 2;
  if (instant) {
    pill.style.transition = 'none';
    pill.style.transform = 'translateX(' + x + 'px)';
    void pill.offsetWidth; /* reflow so the next move animates */
    pill.style.transition = '';
  } else {
    pill.style.transform = 'translateX(' + x + 'px)';
  }
}

function syncBottomNav() {
  const fresh = document.querySelector('.bottom-nav');
  if (!fresh) { _navCache = null; return; }
  const key = fresh.getAttribute('data-navkey');
  let nav = fresh;
  if (_navCache && _navCache.key === key) {
    fresh.replaceWith(_navCache.el); /* keep the same node (pill survives) */
    nav = _navCache.el;
  } else {
    _navCache = { key, el: fresh };
  }
  nav.querySelectorAll('a[data-view]').forEach(a =>
    a.classList.toggle('active', a.getAttribute('data-view') === state.view));
  const badge = nav.querySelector('.badge-dot');
  if (badge) {
    const n = state.unread || 0;
    badge.textContent = n > 9 ? '9+' : String(n);
    badge.style.display = n ? '' : 'none';
  }
  placeNavPill(nav, true);
}

/* ---------- sidebar sliding pill (admin) ----------
   Same idea as the bottom nav: the sidebar node is reused across renders
   so the pill survives and slides vertically between menu items. */
let _sideCache = null;

function placeSidePill(box, instant) {
  const pill = box && box.querySelector('.side-pill');
  const active = box && box.querySelector('.side-item.active');
  if (!pill || !active) return;
  pill.style.height = active.offsetHeight + 'px';
  const y = active.offsetTop;
  if (instant) {
    pill.style.transition = 'none';
    pill.style.transform = 'translateY(' + y + 'px)';
    void pill.offsetHeight; /* reflow so the next move animates */
    pill.style.transition = '';
  } else {
    pill.style.transform = 'translateY(' + y + 'px)';
  }
}

function syncSidebar() {
  const fresh = document.querySelector('.side-items');
  if (!fresh) { _sideCache = null; return; }
  let box = fresh;
  if (_sideCache) { fresh.replaceWith(_sideCache.el); box = _sideCache.el; }
  else _sideCache = { el: fresh };
  box.querySelectorAll('.side-item[data-view]').forEach(b =>
    b.classList.toggle('active', b.getAttribute('data-view') === state.view));
  const chats = (state.chats || []).filter(m => m.status === 'Open').length;
  box.querySelectorAll('.side-badge[data-count="chats"]').forEach(el => {
    el.textContent = chats > 9 ? '9+' : String(chats);
    el.style.display = chats ? '' : 'none';
  });
  const pend = state.pendingReq || 0;
  box.querySelectorAll('.side-badge[data-count="pending"]').forEach(el => {
    el.textContent = pend > 9 ? '9+' : String(pend);
    el.style.display = pend ? '' : 'none';
  });
  placeSidePill(box, true);
}

/* slide the pill the moment a tab is tapped (before data loads + render) */
document.addEventListener('click', function (e) {
  if (!e.target || !e.target.closest) return;
  const a = e.target.closest('.bottom-nav a[data-view]');
  if (a) {
    const nav = a.closest('.bottom-nav');
    nav.querySelectorAll('a').forEach(x => x.classList.toggle('active', x === a));
    placeNavPill(nav, false);
  }
  const b = e.target.closest('.side-item[data-view]');
  if (b) {
    const box = b.closest('.side-items');
    box.querySelectorAll('.side-item').forEach(x => x.classList.toggle('active', x === b));
    placeSidePill(box, false);
  }
});

/* ---------- badges ---------- */
async function updateUnread() {
  try {
    const r = await Api.get('/api/notifications/unread-count');
    state.unread = r.count;
  } catch (e) {}
  if (state.me && state.me.role === 'admin') {
    try { state.pendingReq = (await Api.get('/api/requests/pending-count')).count; } catch (e) {}
  }
}
function paintUnread() {
  /* badge text is baked into HTML at render; nothing else needed */
}

/* ---------- notification sound + vibration ---------- */
let _notifSeen = null;
function notifSoundOn() {
  try { return localStorage.getItem('cdlshs_sound_off') !== '1'; } catch (e) { return true; }
}
function toggleNotifSound() {
  try {
    const off = localStorage.getItem('cdlshs_sound_off') === '1';
    localStorage.setItem('cdlshs_sound_off', off ? '0' : '1');
    toast(off ? 'Notification sound ON' : 'Notification sound muted', 'info');
    render();
  } catch (e) {}
}
function playNotifChime() {
  if (!notifSoundOn()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    window._ac = window._ac || new AC();
    const ac = window._ac;
    if (ac.state === 'suspended') ac.resume();
    const t0 = ac.currentTime;
    [[880, 0], [1174.7, 0.13]].forEach(([freq, t]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + t);
      g.gain.exponentialRampToValueAtTime(0.2, t0 + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.35);
      o.connect(g); g.connect(ac.destination);
      o.start(t0 + t); o.stop(t0 + t + 0.4);
    });
  } catch (e) {}
}
function notifyPulse() {
  playNotifChime();
  try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) {}
}

/* ---------- auth actions ---------- */
async function doLogin(e) {
  e.preventDefault();
  state.error = '';
  const email = document.getElementById('li-email').value.trim();
  const password = document.getElementById('li-pass').value;
  try {
    const data = await Api.post('/api/auth/login', { email, password });
    Api.saveSession(data.token, data.user);
    state.me = await Api.get('/api/auth/me');
    toast('Welcome back, ' + data.user.name + '!');
    await go(data.user.role === 'admin' ? 'adminDashboard' : 'dashboard');
  } catch (err) {
    state.error = err.message;
    render();
  }
}

function toggleTvSpec() {
  const wrap = document.getElementById('rg-spec-wrap');
  if (wrap) wrap.style.display = document.getElementById('rg-strand').value === 'TVL/TechPro' ? '' : 'none';
}

/* ---------- Google Sign-In (client) ----------
   The button only appears when the server reports a configured
   GOOGLE_CLIENT_ID (via GET /api/app/config). */
let _gisLoading = false;
function maybeInitGoogle() {
  const cid = state.appConfig && state.appConfig.googleClientId;
  if (!cid) return;                     /* not configured → no button */
  renderGoogleBtn(cid);
  if (_gisLoading || window.google && window.google.accounts && window.google.accounts.id) return;
  _gisLoading = true;
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client?hl=en';   /* force English button text */
  s.async = true;
  s.defer = true;
  s.onload = () => renderGoogleBtn(cid);
  s.onerror = () => { _gisLoading = false; };
  document.head.appendChild(s);
}
function renderGoogleBtn(cid) {
  const box = document.getElementById('gbtn');
  if (!box || !window.google || !google.accounts || !google.accounts.id) return;
  if (box.dataset.gisReady === cid) return;   /* already drawn for this client */
  box.innerHTML = '';
  try {
    google.accounts.id.initialize({
      client_id: cid,
      callback: onGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true
    });
    google.accounts.id.renderButton(box, {
      theme: isDark() ? 'filled_black' : 'outline',
      size: 'large',
      width: 320,
      text: 'continue_with',
      shape: 'rectangular'
    });
    box.dataset.gisReady = cid;
  } catch (e) { console.error('Google button', e); }
}

/* Step 1 response from Google → send the ID token to our server */
async function onGoogleCredential(credential) {
  try {
    const data = await Api.post('/api/auth/google', { idToken: credential });
    if (data.needsProfile) {
      /* brand-new Google user → must fill up a profile first */
      const p = data.profile || {};
      const parts = String(p.name || '').trim().split(/\s+/);
      state.gp = {
        tempToken: data.tempToken,
        email: p.email || '',
        name: p.name || '',
        picture: p.picture || '',
        firstName: parts.length > 1 ? parts[0] : '',
        lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
        middleName: ''
      };
      state.error = '';
      go('googleProfile');
      return;
    }
    Api.saveSession(data.token, data.user);
    state.me = await Api.get('/api/auth/me');
    toast('Welcome, ' + data.user.name + '!');
    await go(data.user.role === 'admin' ? 'adminDashboard' : 'dashboard');
  } catch (err) {
    state.error = err.message;
    render();
  }
}

function gpToggleSpec() {
  const wrap = document.getElementById('gp-spec-wrap');
  if (wrap) wrap.style.display = document.getElementById('gp-strand').value === 'TVL/TechPro' ? '' : 'none';
}

/* Step 2: new Google user submits their profile → account created + logged in */
async function doGoogleProfile(e) {
  e.preventDefault();
  state.error = '';
  const strandSel = document.getElementById('gp-strand').value;
  const specEl = document.getElementById('gp-spec');
  const body = {
    tempToken: state.gp && state.gp.tempToken,
    studentNumber: document.getElementById('gp-num').value.trim(),
    firstName: document.getElementById('gp-first').value.trim(),
    lastName: document.getElementById('gp-last').value.trim(),
    middleName: document.getElementById('gp-middle').value.trim(),
    gradeLevel: document.getElementById('gp-grade').value,
    strand: (strandSel === 'TVL/TechPro' && specEl) ? 'TVL/TechPro - ' + specEl.value : strandSel,
    contact: document.getElementById('gp-contact').value.trim(),
    password: document.getElementById('gp-pass').value
  };
  const weak = passwordIssue(body.password);
  /* stash what was typed so an error re-render doesn't wipe the form */
  const stash = {
    studentNumber: body.studentNumber, firstName: body.firstName, lastName: body.lastName,
    middleName: body.middleName, gradeLevel: body.gradeLevel, strandSel: strandSel,
    spec: (specEl ? specEl.value : ''), contact: body.contact, password: body.password
  };
  const keepGp = () => { state.form = state.form || {}; state.form.gp = stash; };
  if (weak) { keepGp(); state.error = weak; return render(); }
  try {
    const data = await Api.post('/api/auth/google/complete', body);
    delete state.form.gp;
    state.gp = null;
    Api.saveSession(data.token, data.user);
    state.me = await Api.get('/api/auth/me');
    toast('Welcome to Smart Registrar, ' + data.user.name + '!');
    await go('dashboard');
  } catch (err) {
    keepGp();
    state.error = err.message;
    render();
  }
}

async function doRegister(e) {
  e.preventDefault();
  state.error = '';
  const strandSel = document.getElementById('rg-strand').value;
  const specEl = document.getElementById('rg-spec');
  const body = {
    studentNumber: document.getElementById('rg-num').value.trim(),
    email: document.getElementById('rg-email').value.trim(),
    firstName: document.getElementById('rg-first').value.trim(),
    lastName: document.getElementById('rg-last').value.trim(),
    middleName: document.getElementById('rg-middle').value.trim(),
    gradeLevel: document.getElementById('rg-grade').value,
    strand: (strandSel === 'TVL/TechPro' && specEl) ? 'TVL/TechPro - ' + specEl.value : strandSel,
    contact: document.getElementById('rg-contact').value.trim(),
    password: document.getElementById('rg-pass').value
  };
  const weak = passwordIssue(body.password);
  /* stash everything typed so an error re-render doesn't wipe the form */
  const stash = {
    studentNumber: body.studentNumber, email: body.email, firstName: body.firstName,
    lastName: body.lastName, middleName: body.middleName, gradeLevel: body.gradeLevel,
    strandSel: strandSel, spec: (specEl ? specEl.value : ''), contact: body.contact,
    password: body.password
  };
  const keepRg = () => { state.form = state.form || {}; state.form.rg = stash; };
  if (weak) { keepRg(); state.error = weak; return render(); }
  try {
    const data = await Api.post('/api/auth/register', body);
    if (state.form) delete state.form.rg;
    state.otpPurpose = 'register';
    state.otpEmail = body.email;
    state.devOtp = (data && data.devOtp) || '';
    state.error = '';
    go('otp');
  } catch (err) {
    keepRg();
    state.error = err.message;
    render();
  }
}

async function doVerifyRegisterOtp(e) {
  e.preventDefault();
  state.error = '';
  const code = document.getElementById('otp-code').value.trim();
  if (code.length !== 6) { state.error = 'Enter the 6-digit code'; return render(); }
  try {
    await Api.post('/api/auth/register/verify-otp', { email: state.otpEmail, otp: code });
    toast('Account created — you can now sign in.');
    state.error = ''; state.otpPurpose = ''; state.otpEmail = ''; state.devOtp = '';
    go('login');
  } catch (err) {
    state.error = err.message;
    render();
  }
}

async function doChangePasswordRequestOtp(e) {
  e.preventDefault();
  state.error = '';
  const currentPassword = document.getElementById('cp-current').value;
  const newPassword = document.getElementById('cp-new').value;
  const confirm = document.getElementById('cp-confirm').value;
  /* keep whatever the user typed so an error doesn't clear the fields */
  const stash = { currentPassword, newPassword, confirm };
  const keepCp = () => { state.form = state.form || {}; state.form.cp = stash; };
  if (newPassword !== confirm) { keepCp(); state.error = 'Passwords do not match'; return render(); }
  const weak = passwordIssue(newPassword);
  if (weak) { keepCp(); state.error = weak; return render(); }
  try {
    const data = await Api.post('/api/auth/change-password/request-otp', { currentPassword, newPassword });
    if (state.form) delete state.form.cp;
    state.otpPurpose = 'change_password';
    state.otpEmail = state.me ? state.me.email : '';
    state.devOtp = (data && data.devOtp) || '';
    state.error = '';
    go('otp');
  } catch (err) {
    keepCp();
    state.error = err.message;
    render();
  }
}

async function doChangePasswordVerifyOtp(e) {
  e.preventDefault();
  state.error = '';
  const code = document.getElementById('otp-code').value.trim();
  if (code.length !== 6) { state.error = 'Enter the 6-digit code'; return render(); }
  try {
    const data = await Api.post('/api/auth/change-password/verify-otp', { otp: code });
    if (data.token) Api.saveSession(data.token, state.me);
    toast('Password changed successfully.');
    state.error = ''; state.otpPurpose = ''; state.otpEmail = ''; state.devOtp = '';
    go('profile');
  } catch (err) {
    state.error = err.message;
    render();
  }
}

function resendOtp() {
  toast('Please go back and submit the form again to request a new code.', 'info');
}

async function askLogout() {
  const ok = await confirmDlg('Are you sure you want to log out?', 'Log out');
  if (ok) logout();
}

function logout() {
  Api.clearSession();
  state.me = null;
  state.unread = 0;
  state.book = { service: '', date: '', slotId: null, startTime: '', purpose: '' };
  state.confirmed = null;
  state.view = 'login';
  state.error = '';
  if (typeof Chat !== 'undefined') Chat.reset();
  render();
}

function changeServer() {
  if (!confirm('Change the server address? You will be signed out.')) return;
  Api.clearSession();
  try { localStorage.removeItem('apiBase'); } catch (e) {}
  location.reload();
}

/* ---------- booking flow ---------- */
function pickService(name) { state.book.service = name; render(); }
function pickDate(iso) { state.book.date = iso; state.book.slotId = null; render(); }
function pickSlot(id, date, startTime) {
  Object.assign(state.book, { slotId: id, date, startTime });
  if (state.view !== 'availability') go('availability');
  else render();
}
async function confirmBooking() {
  const b = state.book;
  if (!b.service || !b.slotId) { toast('Complete steps 1–3 first.', 'error'); return; }
  const purposeEl = document.getElementById('bk-purpose');
  const purpose = purposeEl ? purposeEl.value.trim() : (b.purpose || '');
  try {
    const appt = await Api.post('/api/appointments', {
      slotId: b.slotId, service: b.service, purpose
    });
    state.confirmed = appt;
    state.book = { service: '', date: '', slotId: null, startTime: '', purpose: '' };
    toast('Appointment ' + appt.ref + ' submitted!');
    await go('apptConfirmed');
  } catch (err) {
    toast(err.message, 'error');
    await go('availability');
  }
}
async function cancelAppt(id) {
  const ok = await confirmDlg('Cancel this appointment? This frees the slot for other students.', 'Yes, cancel it');
  if (!ok) return;
  try {
    await Api.put('/api/appointments/' + id + '/status', { status: 'Cancelled' });
    toast('Appointment cancelled.');
    await go(state.view === 'dashboard' ? 'dashboard' : 'myAppointments');
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- document requests ---------- */
let _reqDraft = null;

function openRequestForm() {
  const types = state.docTypes && state.docTypes.length
    ? state.docTypes
    : [{ name: 'Certificate of Enrollment' }, { name: 'Diploma' },
       { name: 'SF9' }, { name: 'SF10' },
       { name: 'Certified True Copy' }, { name: 'Other Registrar Documents' }];
  const p = _reqDraft || {};
  openModal(`
    <div class="modal-head">
      <div class="modal-title">New Document Request</div>
      <button class="modal-x" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div id="rf-error"></div>
      <div class="field"><label>Document type</label>
        <select class="input" id="rf-type">
          ${types.map(t => `<option${p.docType === t.name ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}
        </select></div>
      <div class="field"><label>Quantity</label>
        <input class="input" id="rf-qty" type="number" min="1" max="50" value="${p.quantity || 1}"></div>
      <div class="field"><label>Purpose *</label>
        <input class="input" id="rf-purpose" placeholder="e.g., College application" value="${esc(p.purpose || '')}" required></div>
      <div class="field"><label>Additional information</label>
        <textarea class="input" id="rf-notes" placeholder="Anything the registrar should know…">${esc(p.notes || '')}</textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitRequest()">Submit request</button>
    </div>`);
}

/* step 1: validate the form, then show the confirmation summary */
function submitRequest() {
  const body = {
    docType: document.getElementById('rf-type').value,
    quantity: parseInt(document.getElementById('rf-qty').value, 10) || 1,
    purpose: document.getElementById('rf-purpose').value.trim(),
    notes: document.getElementById('rf-notes').value.trim()
  };
  if (!body.purpose) {
    document.getElementById('rf-error').innerHTML = '<div class="error-box">Purpose is required.</div>';
    return;
  }
  _reqDraft = body;
  openModal(`
    <div class="modal-head">
      <div class="modal-title">Confirm request</div>
      <button class="modal-x" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div id="rc-error"></div>
      <p class="muted">Submit this document request? The registrar will be notified and it will appear under <b>Pending</b>.</p>
      <div class="kv"><span class="k">Document</span><span class="v">${esc(body.docType)}</span></div>
      <div class="kv"><span class="k">Quantity</span><span class="v">${body.quantity}</span></div>
      <div class="kv"><span class="k">Purpose</span><span class="v">${esc(body.purpose)}</span></div>
      ${body.notes ? `<div class="kv"><span class="k">Notes</span><span class="v">${esc(body.notes)}</span></div>` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="backToRequestForm()">← Back</button>
      <button class="btn btn-primary" onclick="confirmSubmitRequest()">Yes, submit request</button>
    </div>`);
}

/* back to the form with everything intact */
function backToRequestForm() {
  openRequestForm();
}

/* step 2: actually submit, then show the success confirmation */
async function confirmSubmitRequest() {
  const body = _reqDraft;
  if (!body) { closeModal(); return; }
  try {
    const r = await Api.post('/api/requests', body);
    _reqDraft = null;
    toast('Request ' + r.ref + ' submitted!');
    openModal(`
      <div class="modal-head">
        <div class="modal-title">Request submitted</div>
        <button class="modal-x" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body" style="text-align:center;">
        <div class="qr-box" id="qr-req-target"></div>
        <div class="qr-ref" style="font-size:24px;">${esc(r.ref)}</div>
        <p class="muted small" style="margin-top:8px;">Your request for <b>${esc(r.doc_type)}</b> (x${r.quantity}) was sent to the registrar. Show this QR at the counter — it has your name and what you requested.</p>
        <div style="margin-top:8px;">${stamp(r.status)}</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="closeModal();go('myRequests')">View my requests</button>
      </div>`);
    renderQrInto('qr-req-target', r.ref);
    if (state.view === 'myRequests') await go('myRequests');
    else await go('dashboard');
  } catch (err) {
    /* show the error but keep everything typed */
    openRequestForm();
    const box = document.getElementById('rf-error');
    if (box) box.innerHTML = '<div class="error-box">' + esc(err.message) + '</div>';
  }
}
async function cancelRequest(id) {
  const ok = await confirmDlg('Cancel this document request?', 'Yes, cancel it');
  if (!ok) return;
  try {
    await Api.put('/api/requests/' + id + '/status', { status: 'Cancelled' });
    toast('Request cancelled.');
    await go('myRequests');
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- notifications ---------- */
async function markNotifRead(id) {
  try {
    await Api.put('/api/notifications/' + id + '/read');
    const n = state.notifs.find(x => x.id === id);
    if (n) n.is_read = 1;
    await updateUnread();
    render();
  } catch (e) {}
}
async function markAllRead() {
  try {
    await Api.put('/api/notifications/read-all');
    state.notifs.forEach(n => n.is_read = 1);
    await updateUnread();
    render();
    toast('All notifications marked as read.');
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------- customer service (student) ---------- */
async function sendChat() {
  const subject = document.getElementById('ch-subject').value.trim();
  const body = document.getElementById('ch-body').value.trim();
  if (!subject || !body) { toast('Please fill in subject and message.', 'error'); return; }
  try {
    await Api.post('/api/chat', { subject, body });
    toast('Message sent to the registrar.');
    await go('service');
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- QR helpers ---------- */
function renderQrInto(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';
  if (typeof QRCode === 'undefined') {
    el.innerHTML = '<div class="qr-ref">' + esc(text) + '</div>';
    return;
  }
  new QRCode(el, {
    text: String(text), width: 170, height: 170,
    colorDark: '#12202F', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
}
function showQr(ref) {
  openModal(`
    <div class="modal-head">
      <div class="modal-title">QR Code</div>
      <button class="modal-x" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body" style="text-align:center;">
      <div class="qr-box" id="qr-modal-target"></div>
      <div class="qr-ref">${esc(ref)}</div>
      <div class="qr-hint">Show this to the registrar for scanning or manual lookup.</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="closeModal()">Done</button>
    </div>`);
  renderQrInto('qr-modal-target', ref);
}

/* ---------- admin: student records ---------- */
function filterStudentsSearch(val) {
  state.studentFilter.search = val;
  _restoreFocusId = 'sf-search';
  render();
}
function openStudentForm(id) {
  const s = id ? state.students.find(x => x.id === id) : null;
  openModal(studentFormHTML(s || null));
}
async function saveStudent(id) {
  const body = {
    studentNumber: document.getElementById('sf-num').value.trim(),
    email: document.getElementById('sf-email').value.trim(),
    firstName: document.getElementById('sf-first').value.trim(),
    lastName: document.getElementById('sf-last').value.trim(),
    middleName: document.getElementById('sf-middle').value.trim(),
    gradeLevel: document.getElementById('sf-grade').value.trim(),
    strand: document.getElementById('sf-strand').value.trim(),
    contact: document.getElementById('sf-contact').value.trim(),
    status: document.getElementById('sf-status').value
  };
  const acct = document.getElementById('sf-acct');
  if (acct && acct.value) body.accountStatus = acct.value;
  if (!body.studentNumber || !body.firstName || !body.lastName) {
    document.getElementById('sf-error').innerHTML =
      '<div class="error-box">LRN, first name and last name are required.</div>';
    return;
  }
  try {
    if (id) await Api.put('/api/students/' + id, body);
    else await Api.post('/api/students', body);
    closeModal();
    toast(id ? 'Student updated.' : 'Student added.');
    await loadView('adminStudents');
    render();
  } catch (err) {
    document.getElementById('sf-error').innerHTML = '<div class="error-box">' + esc(err.message) + '</div>';
  }
}
async function deleteStudent(id) {
  const s = state.students.find(x => x.id === id);
  const ok = await confirmDlg('Delete student ' + (s ? s.first_name + ' ' + s.last_name : '#' + id) +
    '? Their requests and appointments will be removed too.', 'Delete student');
  if (!ok) return;
  try {
    await Api.del('/api/students/' + id);
    toast('Student deleted.');
    await loadView('adminStudents');
    render();
  } catch (err) { toast(err.message, 'error'); }
}
async function viewStudentProfile(id) {
  try {
    const d = await Api.get('/api/students/' + id);
    const s = d.student;
    openModal(`
      <div class="modal-head">
        <div class="modal-title">${esc(s.first_name + ' ' + s.last_name)}</div>
        <button class="modal-x" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="kv"><span class="k">LRN</span><span class="v mono">${esc(s.student_number)}</span></div>
        <div class="kv"><span class="k">Grade</span><span class="v">${esc(s.grade_level || '—')}</span></div>
        <div class="kv"><span class="k">Strand</span><span class="v">${esc(s.strand || '—')}</span></div>
        <div class="kv"><span class="k">Contact</span><span class="v">${esc(s.contact || '—')}</span></div>
        <div class="kv"><span class="k">Email</span><span class="v">${esc(s.email || '—')}</span></div>
        <div class="kv"><span class="k">Record</span><span class="v">${stamp(s.status)}</span></div>
        ${s.account_status ? `<div class="kv"><span class="k">Login</span><span class="v">${stamp(s.account_status === 'active' ? 'active' : 'disabled')}</span></div>` : ''}
        <hr class="hr">
        <div class="panel-title">Appointments (${d.appointments.length})</div>
        ${d.appointments.length ? d.appointments.map(a => `
          <div class="flex-between small" style="padding:6px 0;border-bottom:1px dashed var(--border);">
            <span class="mono">${esc(a.ref)}</span>
            <span>${fmtDateShort(a.date)} ${fmtTime(a.start_time)}</span>${stamp(a.status)}</div>`).join('')
          : '<div class="muted small">None yet.</div>'}
        <div class="panel-title mt-14">Document requests (${d.requests.length})</div>
        ${d.requests.length ? d.requests.map(r => `
          <div class="flex-between small" style="padding:6px 0;border-bottom:1px dashed var(--border);">
            <span class="mono">${esc(r.ref)}</span>
            <span>${esc(r.doc_type)}</span>${stamp(r.status)}</div>`).join('')
          : '<div class="muted small">None yet.</div>'}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="closeModal()">Close</button>
      </div>`, { size: 'wide' });
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- admin: appointment actions ---------- */
function filterApptsSearch(val) {
  state.apptAdminFilter.search = val;
  _restoreFocusId = 'as-search';
  render();
}
function filterReqsSearch(val) {
  state.reqAdminFilter.search = val;
  _restoreFocusId = 'rs-search';
  render();
}
async function setApptStatus(id, status) {
  if (['Rejected', 'Cancelled'].includes(status)) {
    const ok = await confirmDlg('Mark this appointment as ' + status + '? The student will be notified.', 'Yes');
    if (!ok) return;
  }
  try {
    await Api.put('/api/appointments/' + id + '/status', { status });
    toast('Appointment marked as ' + status + '.');
    await loadView(state.view);
    render();
  } catch (err) { toast(err.message, 'error'); }
}
async function openReschedule(id) {
  try {
    const slots = await Api.get('/api/slots');
    const open = slots.filter(s => !s.is_booked);
    const appt = state.appts.find(a => a.id === id);
    if (!appt) return;
    openModal(`
      <div class="modal-head">
        <div class="modal-title">Reschedule ${esc(appt.ref)}</div>
        <button class="modal-x" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <p class="muted small">Current: ${fmtDate(appt.date)} · ${timeRange(appt.start_time, appt.end_time)}.
          Pick a new slot — status resets to Pending.</p>
        <div class="mt-14">
          ${open.length === 0 ? '<div class="empty">No open slots. Add availability first.</div>' :
            groupByDate(open).map(([date, rows]) => `
              <div class="slot-group">
                <div class="slot-date-head"><div class="d">${fmtDate(date)}</div></div>
                <div class="slot-chips">${rows.map(x => `
                  <button class="slot-chip" onclick="confirmReschedule(${id},${x.id})">
                    ${timeRange(x.start_time, x.end_time)}</button>`).join('')}
                </div>
              </div>`).join('')}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      </div>`, { size: 'wide' });
  } catch (err) { toast(err.message, 'error'); }
}
async function confirmReschedule(apptId, slotId) {
  try {
    const r = await Api.put('/api/appointments/' + apptId + '/reschedule', { slotId });
    closeModal();
    toast(r.message || 'Appointment rescheduled.');
    await loadView(state.view);
    render();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- admin: request actions ---------- */
async function setReqStatus(id, status) {
  if (['Rejected', 'Cancelled'].includes(status)) {
    const ok = await confirmDlg('Mark this request as ' + status + '? The student will be notified.', 'Yes');
    if (!ok) return;
  }
  try {
    await Api.put('/api/requests/' + id + '/status', { status });
    toast('Request marked as ' + status + '.');
    await loadView(state.view);
    await updateUnread();
    render();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- admin: availability ---------- */
async function saveSlot(id) {
  const date = document.getElementById('sl-date').value;
  const startTime = document.getElementById('sl-start').value;
  const endTime = document.getElementById('sl-end').value;
  if (!date || !startTime || !endTime) { toast('Fill in date, start and end time.', 'error'); return; }
  if (endTime <= startTime) { toast('End time must be after start time.', 'error'); return; }
  try {
    if (id) await Api.put('/api/slots/' + id, { date, startTime, endTime });
    else await Api.post('/api/slots', { date, startTime, endTime });
    toast(id ? 'Slot updated.' : 'Slot added.');
    await loadView('adminAvailability');
    render();
  } catch (err) { toast(err.message, 'error'); }
}
async function setSlotStatus(id, status) {
  try {
    await Api.put('/api/slots/' + id, { status });
    toast(status === 'closed' ? 'Slot closed.' : 'Slot opened.');
    await loadView('adminAvailability');
    render();
  } catch (err) { toast(err.message, 'error'); }
}
async function deleteSlot(id) {
  const ok = await confirmDlg('Delete this slot? It has no bookings.', 'Delete slot');
  if (!ok) return;
  try {
    await Api.del('/api/slots/' + id);
    toast('Slot deleted.');
    await loadView('adminAvailability');
    render();
  } catch (err) { toast(err.message, 'error'); }
}
async function toggleCloseDate(date, status) {
  try {
    const r = await Api.post('/api/slots/close-date', { date, status });
    toast(r.message);
    await loadView('adminAvailability');
    render();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- admin: scanner ---------- */
async function lookupCode(codeOverride) {
  const el = document.getElementById('scan-code');
  const code = (codeOverride || (el ? el.value : '')).trim();
  if (!code) { toast('Enter or scan a code first.', 'error'); return; }
  const out = document.getElementById('scan-result');
  try {
    const d = await Api.get('/api/qr/lookup?code=' + encodeURIComponent(code));
    if (out) out.innerHTML = `
      <div class="panel mb-0" style="border-color:var(--primary);">
        <div class="flex-between">
          <div><b class="mono">${esc(d.ref)}</b> ${stamp(d.status)}</div>
          <span class="muted small">${esc(d.type.replace('_', ' '))}</span>
        </div>
        <div class="mt-8"><b>${esc(d.name)}</b></div>
        <div class="kv"><span class="k">Service / Doc</span><span class="v">${esc(d.service)}</span></div>
        ${d.quantity ? `<div class="kv"><span class="k">Quantity</span><span class="v">${d.quantity}</span></div>` : ''}
        ${d.purpose ? `<div class="kv"><span class="k">Purpose</span><span class="v">${esc(d.purpose)}</span></div>` : ''}
        <div class="kv"><span class="k">Date</span><span class="v">${fmtDate(d.date)}</span></div>
        ${d.time && d.time !== 'x' ? `<div class="kv"><span class="k">Time</span><span class="v">${fmtTime(d.time) || esc(d.time)}</span></div>` : ''}
        <div class="muted small mt-8">Sensitive student details are hidden in QR lookups.</div>
      </div>`;
  } catch (err) {
    if (out) out.innerHTML = '<div class="error-box">' + esc(err.message) + '</div>';
  }
}
async function startCamera() {
  const area = document.getElementById('scan-area');
  if (!area) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    area.innerHTML = '<div class="error-box">Camera is not available in this browser. Use manual lookup below.</div>';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    window._scannerStream = stream;
    area.innerHTML = `
      <div class="scan-frame"><video class="scan-video" id="scan-video" autoplay playsinline muted></video></div>
      <button class="btn btn-danger btn-sm mt-8" onclick="stopCamera()">Stop camera</button>`;
    const video = document.getElementById('scan-video');
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement('canvas');
    window._scannerTimer = setInterval(() => {
      if (!video.videoWidth) return;
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let code = null;
      if (typeof jsQR !== 'undefined') code = jsQR(img.data, img.width, img.height);
      if (code && code.data) {
        stopCamera();
        lookupCode(code.data);
      }
    }, 350);
  } catch (e) {
    area.innerHTML = '<div class="error-box">Camera unavailable: ' + esc(e.message) +
      '. On http://IP addresses the browser blocks cameras — use manual lookup below.</div>';
  }
}
function stopCamera() {
  if (window._scannerTimer) { clearInterval(window._scannerTimer); window._scannerTimer = null; }
  if (window._scannerStream) {
    window._scannerStream.getTracks().forEach(t => t.stop());
    window._scannerStream = null;
  }
  const area = document.getElementById('scan-area');
  if (area) area.innerHTML = '<button class="btn btn-primary" onclick="startCamera()">Start camera</button>';
}

/* ---------- admin: announcements ---------- */
async function saveAnnouncement() {
  const title = document.getElementById('an-title').value.trim();
  const body = document.getElementById('an-body').value.trim();
  if (!title || !body) { toast('Title and message are required.', 'error'); return; }
  try {
    await Api.post('/api/announcements', { title, body });
    toast('Announcement posted.');
    await loadView('adminAnnouncements');
    render();
  } catch (err) { toast(err.message, 'error'); }
}
async function deleteAnnouncement(id) {
  const ok = await confirmDlg('Delete this announcement?', 'Delete');
  if (!ok) return;
  try {
    await Api.del('/api/announcements/' + id);
    toast('Announcement deleted.');
    await loadView('adminAnnouncements');
    render();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- admin: customer service ---------- */
function openReply(id) {
  const m = state.chats.find(x => x.id === id);
  if (!m) return;
  openModal(`
    <div class="modal-head">
      <div class="modal-title">Reply to ${esc(m.student_name)}</div>
      <button class="modal-x" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <p class="muted small"><b>${esc(m.subject)}</b><br>${esc(m.body)}</p>
      <div class="field mt-14"><label>Your reply</label>
        <textarea class="input" id="rp-body" placeholder="Type your answer…"></textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="sendReply(${id})">Send reply</button>
    </div>`);
}
async function sendReply(id) {
  const reply = document.getElementById('rp-body').value.trim();
  if (!reply) { toast('Type a reply first.', 'error'); return; }
  try {
    await Api.put('/api/chat/' + id + '/reply', { reply });
    closeModal();
    toast('Reply sent and message resolved.');
    await loadView('adminService');
    render();
  } catch (err) { toast(err.message, 'error'); }
}
async function resolveMsg(id) {
  try {
    await Api.put('/api/chat/' + id + '/resolve');
    toast('Marked as resolved.');
    await loadView('adminService');
    render();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- server address setup (APK / remote) ---------- */
function viewSetup() {
  return `
  <div class="setup-page">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="auth-badge logo-badge"><img src="assets/logo.jpg" alt="CDLSHS logo"></div>
        <h1>Connect to Server</h1>
        <p>Enter the address of the Smart Registrar server</p>
      </div>
      <div id="setup-error"></div>
      <div class="field">
        <label>Server address</label>
        <input class="input" id="setup-url" placeholder="https://smart-registrar.onrender.com"
          value="${esc(localStorage.getItem('apiLastTried') || Api.defaultServer)}">
        <div class="form-hint">Works anywhere with internet, e.g.
          <span class="mono">https://smart-registrar.onrender.com</span>. Leave as-is if unsure.</div>
      </div>
      <button class="btn btn-primary btn-block" onclick="saveServerAddress()">Connect</button>
    </div>
  </div>`;
}
async function saveServerAddress() {
  let url = document.getElementById('setup-url').value.trim();
  if (!url) { toast('Enter the server address.', 'error'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
  url = url.replace(/\/+$/, '');
  localStorage.setItem('apiLastTried', url);
  Api.base = url;
  try {
    const ok = await Api.ping();
    if (!ok) throw new Error('Server responded but rejected the request.');
    toast('Connected!');
    state.me = null;
    boot();
  } catch (e) {
    Api.base = '';
    document.getElementById('setup-error').innerHTML =
      '<div class="error-box">Cannot connect: ' + esc(e.message) +
      ' — check the address and your internet connection.</div>';
  }
}

/* ---------- student profile picture ---------- */
async function uploadProfilePhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Please choose an image file.', 'error'); return; }
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read the file'));
      reader.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not load the image'));
      i.src = dataUrl;
    });
    /* resize to max 320x320 JPEG to keep it light */
    const max = 320;
    let w = img.width, h = img.height;
    if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const photo = canvas.toDataURL('image/jpeg', 0.82);
    const r = await Api.put('/api/students/me/photo', { photo });
    if (state.me && state.me.student) state.me.student.profile_photo = r.profile_photo;
    toast('Profile picture saved!');
    render();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    input.value = '';
  }
}

/* ---------- boot ---------- */
async function boot() {
  if (Api.needsServerAddress()) {
    state.view = '__setup';
    document.getElementById('app').innerHTML = viewSetup();
    return;
  }
  /* public config (Google client id, etc.) — non-fatal if it fails */
  try { state.appConfig = await Api.get('/api/app/config'); } catch (e) { state.appConfig = null; }
  if (Api.token) {
    try {
      state.me = await Api.get('/api/auth/me');
    } catch (e) {
      state.me = null;
      Api.clearSession();
      if (e.offline) {
        state.view = '__setup';
        document.getElementById('app').innerHTML = viewSetup();
        document.getElementById('setup-error').innerHTML =
          '<div class="error-box">Cannot reach the server. Check your internet connection, then tap Connect to try again.</div>';
        return;
      }
    }
  }
  if (!state.me) { state.view = 'login'; render(); return; }
  await go(state.me.role === 'admin' ? 'adminDashboard' : 'dashboard');
}

/* periodic badge refresh (does not disturb the screen) + sound on new items */
setInterval(async () => {
  if (!Api.token || !state.me) return;
  try {
    const r = await Api.get('/api/notifications/unread-count');
    if (_notifSeen !== null && r.count > _notifSeen) notifyPulse();
    _notifSeen = r.count;
    if (r.count !== state.unread) { state.unread = r.count; render(); }
  } catch (e) {}
  if (state.me.role === 'admin') {
    try {
      const pc = await Api.get('/api/requests/pending-count');
      if (pc.count !== state.pendingReq) { state.pendingReq = pc.count; render(); }
    } catch (e) {}
  }
}, 12000);

/* ---------- app update notifier ----------
   Compares the live server build against the build this page loaded with.
   A mismatch means a new deploy happened — show a banner; tapping it
   reloads the page (web) or opens the fresh APK download (native). */
const AppUpdate = {
  bootVersion: null,
  bannerShown: false,

  async check() {
    let r;
    try { r = await Api.get('/api/app/version'); } catch (e) { return; }
    if (!r || !r.version) return;
    if (!this.bootVersion) { this.bootVersion = r.version; return; } /* baseline */
    if (r.version !== this.bootVersion) this.show(r.version);
  },

  show(v) {
    if (this.bannerShown || document.getElementById('update-bar')) return;
    this.bannerShown = true;
    const bar = document.createElement('div');
    bar.id = 'update-bar';
    bar.className = 'update-bar';
    bar.innerHTML =
      '<span class="upd-ic">\u{1F504}</span>' +
      '<div class="upd-txt"><b>A new update is available!</b>' +
      '<span class="upd-sub">Version ' + esc(v) + ' - tap to update</span></div>' +
      '<button class="upd-btn" onclick="AppUpdate.apply()">Update</button>' +
      '<button class="upd-x" onclick="AppUpdate.dismiss()" aria-label="Dismiss">\u2715</button>';
    document.body.appendChild(bar);
    try { notifyPulse(); } catch (e) {}
    toast('A new app version is available - tap the banner at the top to update.', 'info');
  },

  dismiss() {
    const b = document.getElementById('update-bar');
    if (b) b.remove();
  },

  apply() {
    if (Api.isNative()) {
      /* APK: bundled code cannot rewrite itself — open the fresh installer */
      window.open(Api.defaultServer + '/downloads/SmartRegistrar.apk', '_blank');
      toast('Download and install the new APK to update.', 'info');
      return;
    }
    /* web: reload with a cache-busting param so the new build is fetched */
    location.href = location.pathname + '?v=' + Date.now();
  }
};
setInterval(() => { AppUpdate.check(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) AppUpdate.check(); });
AppUpdate.check();

boot();
