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
  logFilter: { search: '', action: '', from: '', to: '' },
  logFacets: null,
  reportRange: { from: '', to: '' },
  analytics: null,
  queue: null, queueDate: '', feedback: null,
  unread: 0,
  pendingReq: 0,
  sidebarOpen: false,
  otpPurpose: '', otpEmail: '', devOtp: '',
  /* the code typed on the OTP screen — kept across re-renders so a rejected
     submission never erases what the user already entered */
  otpCode: ''
};

const VIEWS = {
  login: viewLogin, register: viewRegister, otp: viewOtp, changePassword: viewChangePassword, dashboard: viewDashboard,
  forgotPassword: viewForgotPassword,
  availability: viewAvailability, apptConfirmed: viewApptConfirmed,
  myAppointments: viewMyAppointments, myRequests: viewMyRequests,
  notifications: viewNotifications, service: viewService, myQr: viewMyQr,
  assistant: viewAssistant,
  profile: viewProfile, announcements: viewAnnouncements,
  adminDashboard: viewAdminDashboard, adminStudents: viewAdminStudents,
  adminAppointments: viewAdminAppointments, adminRequests: viewAdminRequests,
  adminAvailability: viewAdminAvailability, adminScanner: viewAdminScanner,
  adminAnnouncements: viewAdminAnnouncements, adminService: viewAdminService,
  adminLogs: viewAdminLogs, adminReports: viewAdminReports,
  adminAnalytics: viewAdminAnalytics,
  adminDocTypes: viewAdminDocTypes, adminQueue: viewAdminQueue
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
    case 'login': case 'register': case 'otp': case 'changePassword': case 'forgotPassword': return;
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
    /* the assistant is a pure client-side knowledge base (works offline in the APK) */
    case 'assistant': return;
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
    case 'adminDocTypes':
      state.docTypes = await Api.get('/api/requests/types'); return;
    case 'adminQueue': {
      if (!state.queueDate) state.queueDate = todayISO();
      state.queue = await Api.get('/api/appointments/queue?date=' + encodeURIComponent(state.queueDate));
      return;
    }
    case 'adminAvailability':
      state.slots = await Api.get('/api/slots/all'); return;
    case 'adminScanner': return;
    case 'adminAnnouncements':
      state.anns = await Api.get('/api/announcements'); return;
    case 'adminService':
      state.chats = await Api.get('/api/chat'); return;
    case 'adminLogs': {
      const f = state.logFilter || {};
      const qs = ['limit=200'];
      if (f.search) qs.push('search=' + encodeURIComponent(f.search));
      if (f.action) qs.push('action=' + encodeURIComponent(f.action));
      if (f.from) qs.push('from=' + encodeURIComponent(f.from));
      if (f.to) qs.push('to=' + encodeURIComponent(f.to));
      const [logs, facets] = await Promise.all([
        Api.get('/api/logs?' + qs.join('&')), Api.get('/api/logs/facets')]);
      state.logs = logs; state.logFacets = facets; return;
    }
    case 'adminReports':
      state.reports = await Api.get('/api/reports'); return;
    case 'adminAnalytics': {
      const [analytics, stats, feedback] = await Promise.all([
        Api.get('/api/analytics'), Api.get('/api/dashboard/stats'), Api.get('/api/feedback')]);
      Object.assign(state, { analytics, stats, feedback }); return;
    }
    case 'apptConfirmed': return;
  }
}

/* ---------- navigation ---------- */
async function go(view, patch) {
  if (!state.me && ['login', 'register', 'otp', 'forgotPassword'].indexOf(view) === -1) view = 'login';
  if (state.me && state.me.role !== 'admin' && isAdminView(view)) view = 'dashboard';
  if (patch) Object.assign(state, patch);
  /* a remembered login address only matters while the user is on the login screen */
  if (view !== 'login' && state.form) delete state.form.li;
  /* same rule for the typed OTP and the forgot-password draft */
  if (view !== 'otp') state.otpCode = '';
  if (view !== 'forgotPassword' && state.forgot) delete state.forgot.draft;
  state.view = view;
  state.error = '';
  state.loading = true;
  state.sidebarOpen = false;
  /* arm the inactivity timer the first time we land somewhere with a session */
  if (state.me && !_idleTimer) resetIdleTimer();
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
    restoreFormValues();   /* keep the email typed; the password is deliberately dropped */
    return;
  }
  if (state.view === 'register') { app.innerHTML = viewRegister(); restoreFormValues(); return; }
  if (state.view === 'otp') { app.innerHTML = viewOtp(); restoreFormValues(); return; }
  if (state.view === 'forgotPassword') { app.innerHTML = viewForgotPassword(); restoreFormValues(); return; }

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
  if (state.view === 'login' && f.li) {
    /* a failed login keeps the address so the user only retypes the password */
    _setFormVal('li-email', f.li.email);
  }
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
  if (state.view === 'changePassword' && f.cp) {
    _setFormVal('cp-current', f.cp.currentPassword);
    _setFormVal('cp-new', f.cp.newPassword);
    _setFormVal('cp-confirm', f.cp.confirm);
  }
  /* a rejected OTP submission must not erase the code already typed */
  if (state.view === 'otp' && state.otpCode) _setFormVal('otp-code', state.otpCode);
  /* ...nor may a failed password reset wipe the code and the two new passwords */
  if (state.view === 'forgotPassword' && state.forgot && state.forgot.draft) {
    const d = state.forgot.draft;
    _setFormVal('fp-otp', d.otp);
    _setFormVal('fp-new', d.newPassword);
    _setFormVal('fp-confirm', d.confirm);
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
        <button class="icon-btn" onclick="go('assistant')" title="Virtual Registrar Assistant">🤖</button>
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
    ['adminRequests', '▤', 'Requests'], ['adminDocTypes', '📋', 'Requirements'],
    ['adminAvailability', '◔', 'Pickup Schedule'], ['adminQueue', '🎫', 'Digital Queue'],
    ['adminScanner', '▣', 'QR Scanner'],
    ['adminAnnouncements', '📢', 'Announcements'], ['adminService', '✉', 'Customer Service'],
    ['adminReports', '📊', 'Reports'], ['adminAnalytics', '📈', 'Analytics'],
    ['adminLogs', '≡', 'Activity Logs']
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
        <button class="side-item" onclick="window.open('/download.html','_blank','noopener')"><span class="ic">⬇</span>Download App</button>
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
    if (state.form) delete state.form.li;
    Api.saveSession(data.token, data.user);
    state.me = await Api.get('/api/auth/me');
    toast('Welcome back, ' + data.user.name + '!');
    await go(data.user.role === 'admin' ? 'adminDashboard' : 'dashboard');
  } catch (err) {
    /* wrong credentials: remember the email, clear the password */
    state.form = state.form || {};
    state.form.li = { email };
    state.error = err.message;
    render();
  }
}

function toggleTvSpec() {
  const wrap = document.getElementById('rg-spec-wrap');
  if (wrap) wrap.style.display = document.getElementById('rg-strand').value === 'TVL/TechPro' ? '' : 'none';
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
  /* keep whatever was typed so a rejection doesn't clear the field */
  const keepOtp = () => { state.otpCode = code; };
  if (code.length !== 6) { keepOtp(); state.error = 'Enter the 6-digit code'; return render(); }
  try {
    await Api.post('/api/auth/register/verify-otp', { email: state.otpEmail, otp: code });
    toast('Account created — you can now sign in.');
    state.error = ''; state.otpPurpose = ''; state.otpEmail = ''; state.devOtp = ''; state.otpCode = '';
    go('login');
  } catch (err) {
    keepOtp();
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
  const weak = passwordIssue(newPassword, pwMaxFor(state.me ? state.me.role : 'student'));
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
  /* keep whatever was typed so a rejection doesn't clear the field */
  const keepOtp = () => { state.otpCode = code; };
  if (code.length !== 6) { keepOtp(); state.error = 'Enter the 6-digit code'; return render(); }
  try {
    const data = await Api.post('/api/auth/change-password/verify-otp', { otp: code });
    if (data.token) Api.saveSession(data.token, state.me);
    toast('Password changed successfully.');
    state.error = ''; state.otpPurpose = ''; state.otpEmail = ''; state.devOtp = ''; state.otpCode = '';
    go('profile');
  } catch (err) {
    keepOtp();
    state.error = err.message;
    render();
  }
}

/* ---------- forgot password (from the login screen) ---------- */
async function doForgotRequestOtp(e) {
  e.preventDefault();
  state.error = '';
  const email = document.getElementById('fp-email').value.trim();
  if (!email) { state.error = 'Enter your email address'; return render(); }
  state.forgot = { email, step: 1 };
  try {
    const data = await Api.post('/api/auth/forgot-password/request-otp', { email });
    state.forgot = { email, step: 2 };
    state.devOtp = (data && data.devOtp) || '';
    state.error = '';
    toast('Reset code sent — check your email.');
    render();
  } catch (err) {
    state.error = err.message;
    render();
  }
}

async function doForgotVerifyOtp(e) {
  e.preventDefault();
  state.error = '';
  const email = state.forgot ? state.forgot.email : '';
  const otp = document.getElementById('fp-otp').value.trim();
  const newPassword = document.getElementById('fp-new').value;
  const confirm = document.getElementById('fp-confirm').value;
  /* keep everything typed so a rejected submission doesn't wipe the form */
  const keepDraft = () => { if (state.forgot) state.forgot.draft = { otp, newPassword, confirm }; };
  if (!email) { state.error = 'Please request a code again.'; state.forgot = null; return go('login'); }
  if (otp.length !== 6) { keepDraft(); state.error = 'Enter the 6-digit code'; return render(); }
  if (newPassword !== confirm) { keepDraft(); state.error = 'Passwords do not match'; return render(); }
  /* hindi alam ng client kung admin o student ang account — 12 ang maximum,
     ang server ang magpapatupad ng tamang limit ayon sa role */
  const weak = passwordIssue(newPassword, ADMIN_MAX_PW);
  if (weak) { keepDraft(); state.error = weak; return render(); }
  try {
    const data = await Api.post('/api/auth/forgot-password/verify-otp', { email, otp, newPassword });
    toast((data && data.message) || 'Password reset — you can now sign in.');
    state.error = ''; state.devOtp = ''; state.forgot = null;
    go('login');
  } catch (err) {
    keepDraft();
    state.error = err.message;
    render();
  }
}

async function forgotResend() {
  if (!state.forgot || !state.forgot.email) { state.forgot = null; return go('login'); }
  state.error = '';
  try {
    const data = await Api.post('/api/auth/forgot-password/request-otp', { email: state.forgot.email });
    state.devOtp = (data && data.devOtp) || '';
    toast('New code sent — check your email.');
  } catch (err) {
    state.error = err.message;
  }
  render();
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
  resetIdleTimer();   /* no session left to guard */
  state.unread = 0;
  state.book = { service: '', date: '', slotId: null, startTime: '', purpose: '' };
  state.confirmed = null;
  state.view = 'login';
  state.error = '';
  if (state.form) delete state.form.li;   /* fresh login screen, no stale address */
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
        <select class="input" id="rf-type" onchange="showReqInfo()">
          ${types.map(t => `<option${p.docType === t.name ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}
        </select>
        <div id="rf-info"></div></div>
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
  showReqInfo();
}

/* live requirements panel under the document-type selector */
function showReqInfo() {
  const el = document.getElementById('rf-info');
  if (!el) return;
  const sel = document.getElementById('rf-type');
  const t = (state.docTypes || []).find(x => x.name === (sel ? sel.value : ''));
  if (!t) { el.innerHTML = ''; return; }
  const bits = [];
  if (t.description) bits.push(`<div class="ri-desc">${esc(t.description)}</div>`);
  if (t.requirements) {
    bits.push(`<div class="ri-req"><b>What you need:</b>
      <div class="ri-list">${esc(t.requirements)}</div></div>`);
  }
  bits.push(`<div class="ri-meta">
    <span>Fee: <b>${t.fee ? esc(t.fee) : '—'}</b></span>
    <span>Processing: <b>${Number(t.processing_days) || 1} working day(s)</b></span>
  </div>`);
  el.innerHTML = `<div class="req-info">${bits.join('')}</div>`;
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

/* P2 — improved appointments: bulk approval + no-show */
async function approveAllAppts() {
  try {
    const r = await Api.post('/api/appointments/approve-all', {});
    toast(r.approved ? r.approved + ' pending appointment(s) approved.' : 'No pending appointments to approve.');
    await loadView(state.view);
    render();
  } catch (err) { toast(err.message, 'error'); }
}
async function markNoShow(id) {
  const ok = await confirmDlg('Mark this appointment as a no-show? It will be cancelled and the student notified.', 'Mark no-show');
  if (!ok) return;
  try {
    await Api.post('/api/appointments/' + id + '/noshow', {});
    toast('Appointment marked as a no-show.');
    await loadView(state.view);
    render();
  } catch (err) { toast(err.message, 'error'); }
}

/* P2 — digital queue board actions */
async function setQueueDate(v) {
  state.queueDate = v || todayISO();
  try {
    state.view = 'adminQueue';
    await loadView('adminQueue');
    render();
  } catch (err) { toast(err.message, 'error'); }
}
async function queueAction(id, act) {
  const labels = {
    call: 'Calling the student to the counter…',
    served: 'Marked as served — appointment completed.',
    noshow: 'Marked as a no-show.'
  };
  if (act === 'noshow') {
    const ok = await confirmDlg('Mark this student as a no-show?', 'Yes');
    if (!ok) return;
  }
  try {
    await Api.post('/api/appointments/' + id + '/' + act, {});
    toast(labels[act] || 'Saved.');
    state.view = 'adminQueue';
    await loadView('adminQueue');
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
  /* choosing "Ready for Pickup" always asks WHEN the student can claim it */
  let when = null;
  if (status === 'Ready for Pickup') {
    when = await askPickup(id);
    if (!when) return;                     /* cancelled — nothing changes */
  }
  try {
    const body = { status };
    if (when) { body.pickupDate = when.date; body.pickupTime = when.time; }
    await Api.put('/api/requests/' + id + '/status', body);
    toast(when
      ? 'Ready for Pickup — claim on ' + fmtDateShort(when.date) + ' at ' + fmtTime(when.time) + '.'
      : 'Request marked as ' + status + '.');
    await loadView(state.view);
    await updateUnread();
    render();
  } catch (err) { toast(err.message, 'error'); }
}

/* pickup scheduler modal — returns {date,time} or null when cancelled */
function askPickup(id) {
  return new Promise(resolve => {
    const r = (state.requests || []).find(x => x.id === id) || {};
    let settled = false;
    const finish = v => {
      if (settled) return;
      settled = true;
      window.__pickupFinish = null;
      closeModal();
      resolve(v);
    };
    window.__pickupFinish = finish;
    openModal(
      '<div class="modal-head">' +
        '<div class="modal-title">📅 Set the pickup schedule</div>' +
        '<button class="modal-x" onclick="closeModal()" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<p class="muted">Tell <b>' + esc(r.student_name || 'the student') + '</b> when <b>' +
          esc(r.ref || '') + '</b> — ' + esc(r.doc_type || 'document') +
          ' — can be claimed. Both fields are required.</p>' +
        '<div class="form-row">' +
          '<div class="field"><label for="pk-date">Pickup date *</label>' +
            '<input class="input" type="date" id="pk-date" min="' + todayISO() + '" value="' +
            esc(r.pickup_date || '') + '"></div>' +
          '<div class="field"><label for="pk-time">Pickup time *</label>' +
            '<input class="input" type="time" id="pk-time" value="' +
            esc(r.pickup_time || '08:00') + '"></div>' +
        '</div>' +
        '<div class="muted small" id="pk-hint">The student is notified with this date and time.</div>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-outline" onclick="window.__pickupFinish && window.__pickupFinish(null)">Cancel</button>' +
        '<button class="btn btn-success" id="pk-save" onclick="window.__pickupSubmit()">Save schedule</button>' +
      '</div>');
    /* closing by backdrop / &times; counts as cancelling */
    const origClose = window.closeModal;
    window.closeModal = function () { origClose(); window.closeModal = origClose; finish(null); };
  });
}

/* called by the modal's Save button */
window.__pickupSubmit = function () {
  const d = (document.getElementById('pk-date') || {}).value || '';
  const t = (document.getElementById('pk-time') || {}).value || '';
  const hint = document.getElementById('pk-hint');
  if (!d) { if (hint) hint.textContent = '⚠ Please choose a pickup date.'; return; }
  if (!t) { if (hint) hint.textContent = '⚠ Please choose a pickup time.'; return; }
  if (window.__pickupFinish) window.__pickupFinish({ date: d, time: t });
};

/* edit an existing pickup schedule without changing the status */
async function editPickup(id) {
  const when = await askPickup(id);
  if (!when) return;
  try {
    await Api.put('/api/requests/' + id + '/pickup', { date: when.date, time: when.time });
    toast('Pickup schedule saved — ' + fmtDateShort(when.date) + ' at ' + fmtTime(when.time) + '.');
    await loadView(state.view);
    await updateUnread();
    render();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- request timeline (advanced tracking) ---------- */
function timelineHTML(t) {
  const evts = (t && t.events) || [];
  if (!evts.length) return '<div class="empty">No recorded steps yet.</div>';
  return '<ol class="timeline">' + evts.map(e => `
    <li class="tl-item tl-${esc(e.kind || 'step')}">
      <span class="tl-dot"></span>
      <div class="tl-body">
        <div class="tl-label"><b>${esc(e.label)}</b>
          <span class="muted small">${esc(String(e.at || '').replace('T', ' ').slice(0, 16))}</span></div>
        <div class="muted small">${esc(e.detail || '')}${e.actor ? ' · ' + esc(e.actor) : ''}</div>
      </div>
    </li>`).join('') + '</ol>';
}

/* inline expand / collapse inside a student request card */
async function toggleTimeline(id, btn) {
  const box = document.getElementById('tl-' + id);
  if (!box) return;
  if (box.dataset.open === '1') {
    box.dataset.open = '0'; box.innerHTML = '';
    if (btn) btn.textContent = '🕘 History';
    return;
  }
  if (btn) btn.textContent = 'Loading…';
  try {
    const t = await Api.get('/api/requests/' + id + '/timeline');
    box.dataset.open = '1';
    box.innerHTML = timelineHTML(t);
    if (btn) btn.textContent = '🕘 Hide history';
  } catch (err) {
    if (btn) btn.textContent = '🕘 History';
    toast(err.message, 'error');
  }
}

/* modal version — used from the admin requests table */
async function showTimeline(id) {
  openModal(`
    <div class="modal-head">
      <div class="modal-title">🕘 Request timeline</div>
      <button class="modal-x" onclick="closeModal()" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body" id="tl-modal"><div class="muted">Loading…</div></div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="closeModal()">Close</button>
    </div>`);
  try {
    const t = await Api.get('/api/requests/' + id + '/timeline');
    const body = document.getElementById('tl-modal');
    if (body) {
      body.innerHTML =
        '<div class="muted small" style="margin-bottom:10px;"><b class="mono">' + esc(t.ref) +
        '</b> · ' + esc(t.doc_type) + ' · ' + stamp(t.status) + '</div>' + timelineHTML(t);
    }
  } catch (err) {
    const body = document.getElementById('tl-modal');
    if (body) body.innerHTML = '<div class="error-box">' + esc(err.message) + '</div>';
  }
}

/* ---------- virtual registrar assistant (knowledge base + chat) ---------- */
const ASSISTANT_KB = [
  {
    keys: ['requirement', 'requirements', 'kailangan', 'ano ang need', 'needed', 'anong documents',
      'documents needed', 'magkailangan', 'what do i need', 'gilid'],
    text: 'To request a document you need: (1) your LRN / student number, (2) the purpose of the ' +
      'request, and (3) an account in this app. Open **Requests → + New Request**, pick the document ' +
      'type, then submit — the registrar is notified instantly.',
    action: { js: "go('myRequests')", label: 'Open My Requests' }
  },
  {
    keys: ['appointment', 'book', 'booking', 'schedule a', 'reservation', 'reserve', 'paano mag book',
      'mag book', 'available slot'],
    text: 'Go to **Schedule**, pick a service, choose an open date and slot, add your purpose, then ' +
      'submit. It starts as *Pending* — you get a notification once the registrar approves it.',
    action: { js: "go('availability')", label: 'View schedule' }
  },
  {
    keys: ['track', 'tracking', 'status', 'timeline', 'history', 'progress', 'update sa request',
      'anong status', 'how do i know'],
    text: 'Open **My Requests** and tap 🕘 *History* on any request — it shows every step: submitted, ' +
      'processing, ready for pickup, scanned at the counter, and completed, with the exact date and time.',
    action: { js: "go('myRequests')", label: 'See my requests' }
  },
  {
    keys: ['forgot', 'forgot password', 'reset password', 'password reset', 'nakalimutan', 'di makalogin',
      'cannot login', 'cant login', 'hindi maka login', 'login problem'],
    text: 'On the login screen tap **Forgot password?** — you will receive a 6-digit code by email and ' +
      'can set a new password right away. Remember: a student password is exactly 8 characters with ' +
      'both letters and numbers.',
    action: { js: "go('forgotPassword')", label: 'Reset my password' }
  },
  {
    keys: ['claim', 'pickup', 'kailan makukuha', 'kuha', 'when can i get', 'pick up', 'release',
      'ready for pickup'],
    text: 'When your request turns **Ready for Pickup**, a green note appears with the exact date and ' +
      'time set by the registrar — plus a notification. Bring your school ID or show your QR at the counter.',
    action: { js: "go('myRequests')", label: 'Check my requests' }
  },
  {
    keys: ['24', 'auto complete', 'autocomplete', 'automatic', 'scan', 'scanned', 'window'],
    text: 'When the registrar scans your request QR, a **24-hour claim window** starts. If it is not ' +
      'claimed in that window the request completes automatically — the registrar can also press ' +
      'Completed manually at any time.',
    action: { js: "go('myQr')", label: 'Show my QR' }
  },
  {
    keys: ['qr', 'barcode', 'code', 'scan ko', 'qr code'],
    text: 'Your **My QR** page holds your student verification code and a QR for each active request ' +
      'or appointment. Show it at the counter — the registrar scans or types the reference code.',
    action: { js: "go('myQr')", label: 'Open My QR' }
  },
  {
    keys: ['password', 'password rule', 'ano ang password', '8 characters', 'change password'],
    text: 'Student passwords are **exactly 8 characters** and must contain both letters and numbers. ' +
      'You can change yours any time from Profile → Change password (a 6-digit code is emailed to you).',
    action: { js: "go('profile')", label: 'Open my profile' }
  },
  {
    keys: ['lock', 'locked', '5 attempts', 'wrong password', 'maling password', 'too many'],
    text: 'Five consecutive wrong passwords lock the account for **15 minutes**. Wait it out, use ' +
      '*Forgot password?*, or retype the email carefully — a failed login keeps your email but clears ' +
      'only the password field.',
    action: { js: "go('forgotPassword')", label: 'Reset my password' }
  },
  {
    keys: ['cancel', 'delete my request', 'void', 'babawasan'],
    text: 'While a request is still **Pending** or **Processing** you can cancel it yourself from ' +
      '**My Requests**. Once it is Ready for Pickup, talk to the registrar through Customer Service.',
    action: { js: "go('myRequests')", label: 'Open My Requests' }
  },
  {
    keys: ['fee', 'fees', 'bayad', 'magkano', 'how much', 'price', 'payment', 'pay'],
    text: 'The app never asks for payment — any fees are settled at the registrar\'s counter when you ' +
      'claim your document. The schedule and status here are always free to view.'
  },
  {
    keys: ['hours', 'open', 'office hours', 'anong oras', 'sched', 'when open', 'close'],
    text: 'Pickup and appointment hours come from the **Pickup Schedule** the registrar posts in the ' +
      'app. Whatever is shown as an open slot is when the counter is serving students.',
    action: { js: "go('availability')", label: 'View schedule' }
  },
  {
    keys: ['announcement', 'notice', 'paunawa', 'balita'],
    text: 'Every announcement from the registrar appears on your dashboard and under **Announcements** — ' +
      'check it before you go to the counter.',
    action: { js: "go('announcements')", label: 'Read announcements' }
  },
  {
    keys: ['person', 'human', 'real', 'admin', 'registrar', 'talk to', 'tao', 'help pa', 'customer service',
      'complaint', 'concern'],
    text: 'For anything personal — corrections, special requests, or concerns — open **Customer Service** ' +
      'and the registrar will reply inside the app.',
    action: { js: "go('service')", label: 'Open Customer Service' }
  },
  {
    keys: ['thank', 'salamat', 'thanks', 'ty', 'appreciate'],
    text: 'You\'re welcome! Anything else about requests, appointments or your QR?'
  },
  {
    keys: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'kumusta'],
    text: 'Hello! 👋 I can explain document requirements, appointment booking, request tracking, QR codes ' +
      'and account issues. What do you need?'
  }
];
const ASSISTANT_FALLBACK =
  'I\'m not sure about that one. Try one of the questions below — or tap **Talk to a person** and the ' +
  'registrar will answer you directly.';

function _assistantScore(entry, q) {
  let score = 0;
  for (const k of entry.keys) if (q.indexOf(k) !== -1) score += k.length > 4 ? 2 : 1;
  return score;
}
function assistantAnswer(q) {
  const text = String(q || '').toLowerCase().trim();
  if (!text) return null;
  let best = null, bestScore = 0;
  for (const e of ASSISTANT_KB) {
    const s = _assistantScore(e, text);
    if (s > bestScore) { bestScore = s; best = e; }
  }
  if (!best || bestScore === 0) {
    return { text: ASSISTANT_FALLBACK, action: { js: "go('service')", label: 'Talk to a person' } };
  }
  return { text: best.text.replace(/\*\*/g, '').replace(/\*/g, ''), action: best.action || null };
}
function _assistantScroll() {
  const el = document.getElementById('asst-thread');
  if (el) el.scrollTop = el.scrollHeight;
}
function assistantAsk(question) {
  const q = String(question || '').trim();
  if (!q) return;
  state.assistant = state.assistant || [];
  state.assistant.push({ who: 'me', text: q });
  const a = assistantAnswer(q) || { text: ASSISTANT_FALLBACK };
  state.assistant.push({ who: 'bot', text: a.text, action: a.action });
  render();
  _assistantScroll();
}
function assistantSend(ev) {
  if (ev) ev.preventDefault();
  const el = document.getElementById('asst-input');
  const q = el ? el.value : '';
  if (el) el.value = '';
  assistantAsk(q);
}

/* ---------- student feedback & ratings ---------- */
let _fbRating = 0;
function openFeedback() {
  _fbRating = 0;
  openModal(`
    <div class="modal-head">
      <div class="modal-title">⭐ Rate our service</div>
      <button class="modal-x" onclick="closeModal()" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
      <div id="fb-error"></div>
      <p class="muted">How was your experience with the registrar's office? Your rating helps us improve.</p>
      <div class="star-row" id="fb-stars">
        ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="star" data-n="${n}"
          onclick="pickStar(${n})" aria-label="${n} star(s)">★</button>`).join('')}
      </div>
      <div class="field"><label for="fb-comment">Comments (optional)</label>
        <textarea class="input" id="fb-comment"
          placeholder="Tell us what went well or what we can improve…"></textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitFeedback()">Submit rating</button>
    </div>`);
}
function pickStar(n) {
  _fbRating = n;
  const stars = document.querySelectorAll('#fb-stars .star');
  for (let i = 0; i < stars.length; i++) stars[i].classList.toggle('on', i < n);
}
async function submitFeedback() {
  if (!_fbRating) {
    const box = document.getElementById('fb-error');
    if (box) box.innerHTML = '<div class="error-box">Pick a star rating first.</div>';
    return;
  }
  try {
    const c = document.getElementById('fb-comment');
    await Api.post('/api/feedback', { rating: _fbRating, comment: c ? c.value : '' });
    closeModal();
    toast('Salamat for your ' + _fbRating + '-star rating! ⭐');
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------- admin: activity log filters ---------- */
let _logTimer = null;
function setLogFilter(key, val, debounce) {
  state.logFilter = state.logFilter || { search: '', action: '', from: '', to: '' };
  state.logFilter[key] = val || '';
  if (key === 'search') _restoreFocusId = 'lg-search';
  if (_logTimer) clearTimeout(_logTimer);
  const run = () => { loadView('adminLogs').then(render).catch(e => toast(e.message, 'error')); };
  if (debounce) _logTimer = setTimeout(run, 300);
  else run();
}
function clearLogFilter() {
  state.logFilter = { search: '', action: '', from: '', to: '' };
  loadView('adminLogs').then(render).catch(e => toast(e.message, 'error'));
}

/* ---------- printable reports ---------- */
function _reportRange() {
  const r = state.reportRange || { from: '', to: '' };
  return d => {
    const day = String(d || '').slice(0, 10);
    if (r.from && day && day < r.from) return false;
    if (r.to && day && day > r.to) return false;
    return true;
  };
}
function setReportRange(key, val) {
  state.reportRange = state.reportRange || { from: '', to: '' };
  state.reportRange[key] = val || '';
  render();
}
async function printReport(kind) {
  const inRange = _reportRange();
  const r = state.reportRange || {};
  const rangeLabel = (r.from || r.to)
    ? 'From ' + (r.from || '…') + ' to ' + (r.to || '…')
    : 'All records';
  const by = (state.me && state.me.name) || 'Registrar';
  try {
    let opts;
    if (kind === 'requests') {
      const list = (await Api.get('/api/requests')).filter(x => inRange(x.created_at));
      opts = {
        title: 'Document Requests Report', subtitle: rangeLabel, by,
        head: ['Ref', 'Student', 'Document', 'Qty', 'Pickup schedule', 'Status', 'Filed'],
        rows: list.map(x => [x.ref, x.student_name, x.doc_type, x.quantity,
          (x.pickup_date || '') + (x.pickup_time ? ' · ' + fmtTime(x.pickup_time) : ''),
          x.status, String(x.created_at).slice(0, 10)]),
        meta: [{ label: 'Records:', value: list.length }]
      };
    } else if (kind === 'appointments') {
      const list = (await Api.get('/api/appointments')).filter(x => inRange(x.created_at));
      opts = {
        title: 'Appointments Report', subtitle: rangeLabel, by,
        head: ['Ref', 'Student', 'Service', 'Schedule', 'Status', 'Filed'],
        rows: list.map(x => [x.ref, x.student_name, x.service,
          fmtDateShort(x.date) + ' · ' + timeRange(x.start_time, x.end_time),
          x.status, String(x.created_at).slice(0, 10)]),
        meta: [{ label: 'Records:', value: list.length }]
      };
    } else if (kind === 'students') {
      const list = (await Api.get('/api/students')).filter(x => inRange(x.created_at));
      opts = {
        title: 'Student Roster', subtitle: rangeLabel, by,
        head: ['LRN / Student No.', 'Name', 'Grade', 'Strand', 'Status', 'Registered'],
        rows: list.map(x => [x.student_number, (x.first_name || '') + ' ' + (x.last_name || ''),
          x.grade_level ? 'Grade ' + x.grade_level : '—', x.strand || '—', x.status,
          String(x.created_at).slice(0, 10)]),
        meta: [{ label: 'Students:', value: list.length }]
      };
    } else {
      const [an, st] = await Promise.all([Api.get('/api/analytics'), Api.get('/api/dashboard/stats')]);
      const rq = an.requests || {}, ap = an.appointments || {};
      opts = {
        title: 'Registrar Summary', subtitle: schoolYear() + ' · ' + currentSem(), by,
        head: ['Indicator', 'Value'],
        rows: [
          ['Total students', st.totalStudents],
          ['Document requests (all)', rq.total],
          ['Completed', rq.completed + ' (' + rq.completionRate + '%)'],
          ['Rejected / cancelled', rq.rejected + ' (' + rq.rejectionRate + '%)'],
          ['Still in the queue (backlog > 2 days)', rq.backlog],
          ['Requests filed today / this week', rq.today + ' / ' + rq.week],
          ['Average turnaround', rq.avgTurnaroundH + ' h'],
          ['Completed within the 24h claim window', rq.within24hRate + '%'],
          ['Appointments', ap.total + ' (show rate ' + ap.showRate + '%)'],
          ['Awaiting approval', ap.pending],
          ['Most requested document', (an.top.documents[0] || {}).label || '—'],
          ['Most active requester', (an.top.students[0] || {}).label || '—']
        ],
        meta: [{ label: 'Period:', value: rangeLabel }]
      };
    }
    printArea(reportHTML(opts));
  } catch (e) { toast(e.message, 'error'); }
}
/* printable version of whatever the activity log currently shows */
function printLogs() {
  const logs = state.logs || [];
  const f = state.logFilter || {};
  const bits = [];
  if (f.search) bits.push('search "' + f.search + '"');
  if (f.action) bits.push('action ' + f.action);
  if (f.from || f.to) bits.push((f.from || '…') + ' → ' + (f.to || '…'));
  printArea(reportHTML({
    title: 'System Activity Log',
    subtitle: bits.length ? 'Filtered: ' + bits.join(' · ') : 'All recorded activity',
    by: (state.me && state.me.name) || 'Registrar',
    head: ['Time', 'User', 'Action', 'Details'],
    rows: logs.map(l => [String(l.created_at).replace('T', ' ').slice(0, 16), l.user_name, l.action, l.details]),
    meta: [{ label: 'Entries:', value: logs.length }]
  }));
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
    /* scanning a document request starts its 24-hour claim window */
    let claim = null;
    if (d.type === 'document_request' && d.id && d.status !== 'Completed') {
      try { claim = await Api.post('/api/requests/' + d.id + '/claim', {}); } catch (e) { claim = null; }
      if (claim && claim.started) toast('24-hour claim window started for ' + d.ref + '.');
    }
    if (out) out.innerHTML = `
      <div class="panel mb-0" style="border-color:var(--primary);">
        ${d.verify ? `<div class="verify-badge vt-${esc(d.verify.tone || 'ok')}">
          <span class="vb-icon">${d.verify.tone === 'ok' ? '✔' : d.verify.tone === 'warn' ? '⚠' : d.verify.tone === 'bad' ? '✕' : 'ℹ'}</span>
          <span class="vb-verdict mono">${esc(d.verify.verdict)}</span>
          <span class="vb-msg">${esc(d.verify.message || '')}</span>
        </div>` : ''}
        <div class="flex-between mt-8">
          <div><b class="mono">${esc(d.ref)}</b> ${stamp(d.status)}</div>
          <span class="muted small">${esc(d.type.replace('_', ' '))}</span>
        </div>
        <div class="mt-8"><b>${esc(d.name)}</b></div>
        <div class="kv"><span class="k">Service / Doc</span><span class="v">${esc(d.service)}</span></div>
        ${d.quantity ? `<div class="kv"><span class="k">Quantity</span><span class="v">${d.quantity}</span></div>` : ''}
        ${d.purpose ? `<div class="kv"><span class="k">Purpose</span><span class="v">${esc(d.purpose)}</span></div>` : ''}
        <div class="kv"><span class="k">Date</span><span class="v">${fmtDate(d.date)}</span></div>
        ${d.time && d.time !== 'x' ? `<div class="kv"><span class="k">Time</span><span class="v">${fmtTime(d.time) || esc(d.time)}</span></div>` : ''}
        ${d.type === 'document_request' ? (
          d.status === 'Completed'
            ? `<div class="claim-note locked">🔒 <b>Completed</b> — the pickup schedule is locked and can no longer be edited.</div>`
            : claim
              ? `<div class="claim-note"><b>⏱ 24-hour claim window${claim.started ? ' started' : ' running'}</b>
                  — auto-completes <b>${esc(claimDeadlineText(claim.claimed_at))}</b>
                  <span class="muted small">(${esc(claimTimeLeft(claim.claimed_at))}). The registrar may still press
                  <b>Completed</b> manually at any time.</span></div>`
              : ''
        ) : ''}
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

/* ---------- idle auto-logout ----------
   15 minutes without keyboard, pointer, or scroll activity signs the user
   out, so an unattended device does not stay logged in. The timer only runs
   while there is a session to protect, and any real interaction restarts it. */
let IDLE_MS = 15 * 60000;
let _idleTimer = null;
let _idleLast = 0;

function resetIdleTimer() {
  if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
  if (!state.me) return;                 /* nothing to guard while signed out */
  _idleTimer = setTimeout(idleLogout, IDLE_MS);
}

function idleLogout() {
  if (!state.me) return;
  const mins = Math.max(1, Math.round(IDLE_MS / 60000));
  logout();
  toast('Signed out after ' + mins + ' minute' + (mins === 1 ? '' : 's') +
        ' of inactivity — please sign in again.', 'info');
}

/* pointer / keyboard / scroll activity counts as being present */
function _idleActivity() {
  const now = Date.now();
  if (now - _idleLast < 1000) return;     /* throttle: at most once a second */
  _idleLast = now;
  resetIdleTimer();
}

['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll']
  .forEach(ev => window.addEventListener(ev, _idleActivity, { passive: true }));

boot();
