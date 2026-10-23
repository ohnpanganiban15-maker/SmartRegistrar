/* =====================================================
   views/student.js — all student-facing screens
   Each view returns an HTML string. Data comes from
   `state` (loaded by app.js before rendering).
===================================================== */

/* ---------------- LOGIN ---------------- */
function viewLogin() {
  return `
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="auth-badge logo-badge"><img src="assets/logo.jpg" alt="CDLSHS logo"></div>
        <h1>CDLSHS Smart Registrar</h1>
        <p>Appointments &amp; Document Requests</p>
      </div>
      ${state.error ? `<div class="form-error">${esc(state.error)}</div>` : ''}
      <form onsubmit="doLogin(event)">
        <div class="field">
          <label for="li-email">Email address</label>
          <input class="input" id="li-email" type="email" autocomplete="username" placeholder="you@cdlshs.edu.ph" required>
        </div>
        <div class="field">
          <label for="li-pass">Password</label>
          <div class="pass-wrap">
            <input class="input" id="li-pass" type="password" autocomplete="current-password" placeholder="••••••••" required>
            <button type="button" class="pass-eye" onclick="togglePass('li-pass', this)"
              title="Show password" aria-label="Show password">👁</button>
          </div>
        </div>
        <button class="btn btn-primary btn-block" type="submit">Sign in</button>
      </form>
      <div class="auth-switch">
        New student? <a onclick="go('register')">Create an account</a>
      </div>
      <div class="auth-switch small">
        Registrar staff? Sign in with your admin account.
      </div>
    </div>
  </div>`;
}

/* ---------------- REGISTER ---------------- */
function viewRegister() {
  return `
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="auth-badge logo-badge"><img src="assets/logo.jpg" alt="CDLSHS logo"></div>
        <h1>Student Registration</h1>
        <p>Create your Smart Registrar account</p>
      </div>
      ${state.error ? `<div class="form-error">${esc(state.error)}</div>` : ''}
      <form onsubmit="doRegister(event)">
        <div class="form-row">
          <div class="field"><label>LRN</label>
            <input class="input" id="rg-num" placeholder="12-digit Learner Reference Number" required></div>
          <div class="field"><label>Email</label>
            <input class="input" id="rg-email" type="email" placeholder="you@cdlshs.edu.ph" required></div>
        </div>
        <div class="form-row">
          <div class="field"><label>First Name</label><input class="input" id="rg-first" required></div>
          <div class="field"><label>Last Name</label><input class="input" id="rg-last" required></div>
        </div>
        <div class="field"><label>Middle Name <span class="muted small">(optional)</span></label>
          <input class="input" id="rg-middle"></div>
        <div class="form-row">
          <div class="field"><label>Grade / Year Level</label>
            <select class="input" id="rg-grade">
              <option>11</option><option>12</option>
            </select></div>
          <div class="field"><label>Strand</label>
            <select class="input" id="rg-strand" onchange="toggleTvSpec()">
              <option>STEM</option><option>ABM</option><option>HUMMS</option><option>TVL/TechPro</option>
            </select></div>
        </div>
        <div class="field" id="rg-spec-wrap" style="display:none">
          <label>TVL/TechPro Track</label>
          <select class="input" id="rg-spec">
            <option>Programming</option>
            <option>Computer System Servicing (CSS)</option>
            <option>Automotive Servicing (AS)</option>
            <option>Electrical Installation &amp; Maintenance (EIM)</option>
            <option>Electronic Products Assembly &amp; Servicing (EPAS)</option>
            <option>Motorcycle Small Engine Servicing (MSES)</option>
            <option>Shielded Metal Arc Welding (SMAW)</option>
            <option>Cookery</option>
            <option>Food and Beverages Servicing (FBS)</option>
            <option>Bread and Pastry Production (BPP)</option>
            <option>Dressmaking</option>
            <option>Tailoring</option>
            <option>Caregiving</option>
            <option>Beauty &amp; Nail Care (BNC)</option>
            <option>Wellness Massage</option>
            <option>Housekeeping</option>
            <option>Front Office Servicing (FOS)</option>
          </select>
        </div>
        <div class="field"><label>Contact Number</label>
          <input class="input" id="rg-contact" placeholder="09XX XXX XXXX"></div>
        <div class="field"><label>Password</label>
          <input class="input" id="rg-pass" type="password" minlength="8" placeholder="at least 8 characters + letters &amp; numbers" required></div>
        <button class="btn btn-primary btn-block" type="submit">Create account</button>
      </form>
      <div class="auth-switch">Already registered? <a onclick="go('login')">Sign in</a></div>
    </div>
  </div>`;
}

/* ---------------- OTP VERIFICATION ---------------- */
function viewOtp() {
  const purpose = state.otpPurpose || 'register';
  const isRegister = purpose === 'register';
  return `
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="auth-badge logo-badge"><img src="assets/logo.jpg" alt="CDLSHS logo"></div>
        <h1>${isRegister ? 'Verify Your Email' : 'Confirm Password Change'}</h1>
        <p>We sent a 6-digit code to<br><strong>${esc(state.otpEmail || 'your email')}</strong></p>
      </div>
      ${state.error ? `<div class="form-error">${esc(state.error)}</div>` : ''}
      ${state.devOtp ? `
        <div style="background:#FFF7E0;border:1.5px solid #E6B800;border-radius:10px;padding:10px 14px;margin-bottom:12px;text-align:center;">
          <span class="muted small">DEV MODE (Gmail not set) — your code:</span><br>
          <strong style="font-size:26px;letter-spacing:8px;">${esc(state.devOtp)}</strong>
        </div>` : ''}
      <form onsubmit="${isRegister ? 'doVerifyRegisterOtp(event)' : 'doChangePasswordVerifyOtp(event)'}">
        <div class="field">
          <label>One-Time Password (OTP)</label>
          <input class="input" id="otp-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6"
                 placeholder="000000" autocomplete="one-time-code" required autofocus>
        </div>
        <button class="btn btn-primary btn-block" type="submit">Verify &amp; ${isRegister ? 'Create Account' : 'Change Password'}</button>
      </form>
      <div class="auth-switch">
        <a onclick="resendOtp()">Resend code</a> ·
        <a onclick="go('${isRegister ? 'login' : 'profile'}')">Back</a>
      </div>
      <div class="muted small" style="text-align:center;margin-top:8px;">
        Code expires in 10 minutes. Check your spam/junk folder.
      </div>
    </div>
  </div>`;
}

/* ---------------- CHANGE PASSWORD ---------------- */
function viewChangePassword() {
  return `
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="auth-badge logo-badge"><img src="assets/logo.jpg" alt="CDLSHS logo"></div>
        <h1>Change Password</h1>
        <p>We'll send an OTP to your email to confirm</p>
      </div>
      ${state.error ? `<div class="form-error">${esc(state.error)}</div>` : ''}
      <form onsubmit="doChangePasswordRequestOtp(event)">
        <div class="field"><label>Current Password</label>
          <input class="input" id="cp-current" type="password" autocomplete="current-password" required></div>
        <div class="field"><label>New Password</label>
          <input class="input" id="cp-new" type="password" minlength="8" autocomplete="new-password" placeholder="at least 8 characters + letters &amp; numbers" required></div>
        <div class="field"><label>Confirm New Password</label>
          <input class="input" id="cp-confirm" type="password" minlength="6" autocomplete="new-password" required></div>
        <button class="btn btn-primary btn-block" type="submit">Send OTP &amp; Continue</button>
      </form>
      <div class="auth-switch">
        <a onclick="go('${state.me ? 'profile' : 'login'}')">Back to ${state.me ? 'Profile' : 'Login'}</a>
      </div>
    </div>
  </div>`;
}

/* ---------------- STUDENT DASHBOARD ---------------- */
function viewDashboard() {
  const s = state.stats || {};
  const me = state.me || {};
  const nextSlot = (state.slots || [])
    .filter(x => !x.is_booked && x.date >= todayISO())
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))[0];
  const anns = (state.anns || []).slice(0, 2);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');

  return `
  <div class="page-head">
    <div><h2>${greet}, ${esc((me.student && me.student.first_name) || me.name || 'Student')}!</h2>
      <div class="sub">Here's what's happening in your account today.</div></div>
    ${themeBtnHTML()}
  </div>

  <div class="stat-grid">
    <div class="stat-card"><div class="n">${s.pendingRequests || 0}</div><div class="l">Pending Requests</div></div>
    <div class="stat-card gold"><div class="n">${s.processingRequests || 0}</div><div class="l">Processing</div></div>
    <div class="stat-card green"><div class="n">${s.readyRequests || 0}</div><div class="l">Ready for Pickup</div></div>
    <div class="stat-card"><div class="n">${s.completedRequests || 0}</div><div class="l">Completed Requests</div></div>
  </div>

  ${nextSlot ? `
  <div class="hero" style="margin-bottom:16px;">
    <div class="lbl">Next Pickup Schedule</div>
    <div class="big">${fmtDate(nextSlot.date)}</div>
    <div class="row">
      <span>🕑 ${timeRange(nextSlot.start_time, nextSlot.end_time)}</span>
      <span class="stamp st-approved">Open for pickup</span>
    </div>
    <div class="mt-8">
      <button class="btn btn-sm btn-accent" onclick="go('availability')">View full schedule</button>
    </div>
  </div>` : `
  <div class="panel" style="text-align:center;">
    <div style="font-size:30px;">◔</div>
    <div class="muted mt-8">No pickup schedule posted yet — check back soon.</div>
  </div>`}

  ${anns.length ? `<div class="panel"><div class="panel-title">Announcements</div>
    ${anns.map(a => annHTML(a)).join('')}
    ${state.anns.length > 2 ? '<button class="btn btn-sm btn-ghost" onclick="go(\'announcements\')">See all announcements</button>' : ''}
  </div>` : ''}`;
}

function annHTML(a) {
  return `<div class="ann-item">
    <div class="at"><span>${esc(a.title)}</span></div>
    <div class="ab">${esc(a.body)}</div>
    <div class="ad">Posted ${fmtDateShort(String(a.created_at).slice(0, 10))}</div>
  </div>`;
}

/* ---------------- ANNOUNCEMENTS PAGE ---------------- */
function viewAnnouncements() {
  const anns = state.anns || [];
  return `
  <div class="page-head"><h2>Announcements <span class="sub">from the Registrar</span></h2>${themeBtnHTML()}</div>
  ${anns.length ? anns.map(annHTML).join('') : '<div class="card empty"><div class="big">📢</div>No announcements yet.</div>'}`;
}

/* ---------------- PICKUP SCHEDULE (read-only) ---------------- */
function viewAvailability() {
  const slots = (state.slots || []).filter(x => x.date >= todayISO());
  const dates = [...new Set(slots.map(x => x.date))];

  return `
  <div class="page-head">
    <div><h2>Pickup Schedule</h2><div class="sub">When you can claim your documents at the registrar.</div></div>
    ${themeBtnHTML()}
  </div>

  <div class="panel">
    <div class="panel-title">Open for pickup</div>
    ${dates.length === 0 ? '<div class="empty"><div class="big">◔</div>No pickup schedule posted yet — check back soon.</div>' :
      dates.map(iso => {
        const day = slots.filter(x => x.date === iso);
        const open = day.filter(x => !x.is_booked && x.status !== 'closed');
        return `
        <div class="slot-group">
          <div class="slot-date-head"><div class="d">${fmtDate(iso)}</div>
            <div class="w">${open.length} open</div></div>
          <div class="slot-chips">${day.map(x => `
            <span class="slot-chip ${x.status === 'closed' || x.is_booked ? 'booked' : ''}">
              ${timeRange(x.start_time, x.end_time)}
              ${x.status === 'closed' ? '<span class="mini">CLOSED</span>' : ''}
              ${x.status !== 'closed' && x.is_booked ? '<span class="mini">FULL</span>' : ''}
            </span>`).join('')}
          </div>
        </div>`;
      }).join('')}
    <div class="form-hint mt-8">Just come during these hours and show your QR code at the counter — no booking needed.</div>
  </div>`;
}

/* ---------------- APPOINTMENT CONFIRMED ---------------- */
function viewApptConfirmed() {
  const a = state.confirmed;
  if (!a) return '<div class="card empty">No appointment to display.</div>';
  return `
  <div class="page-head"><h2>Appointment Confirmed</h2></div>
  <div class="panel" style="text-align:center;border-color:var(--success);">
    <div style="font-size:44px;">✅</div>
    <h3 class="mt-8">Booking submitted!</h3>
    <p class="muted">Keep this reference number and show the QR code when you arrive.</p>
    <div class="qr-ref mt-14" style="font-size:22px;">${esc(a.ref)}</div>
    <div class="mt-8">${stamp(a.status)}</div>
    <div class="qr-box mt-14" id="qr-target"></div>
    <div class="kv mt-8"><span class="k">Service</span><span class="v">${esc(a.service)}</span></div>
    <div class="kv"><span class="k">Date</span><span class="v">${fmtDate(a.date)}</span></div>
    <div class="kv"><span class="k">Time</span><span class="v">${timeRange(a.start_time, a.end_time)}</span></div>
    <div class="flex mt-14" style="justify-content:center;">
      <button class="btn btn-primary" onclick="go('dashboard')">Back to Dashboard</button>
      <button class="btn btn-outline" onclick="go('myAppointments')">My Appointments</button>
    </div>
  </div>`;
}

/* ---------------- MY APPOINTMENTS ---------------- */
function viewMyAppointments() {
  const appts = state.appts || [];
  return `
  <div class="page-head">
    <div><h2>My Appointments</h2><div class="sub">${appts.length} record(s)</div></div>
    ${themeBtnHTML()}
  </div>
  <div class="filters">
    ${['', 'Pending', 'Approved', 'Completed', 'Cancelled', 'Rejected'].map(st => `
      <button class="btn btn-sm ${(state.apptFilter || '') === st ? 'btn-primary' : 'btn-ghost'}"
        onclick="state.apptFilter='${st}';loadView('myAppointments')">${st || 'All'}</button>`).join('')}
  </div>
  ${appts.length === 0 ? '<div class="card empty"><div class="big">🗓️</div>No appointments yet.</div>' :
    appts.filter(a => !state.apptFilter || a.status === state.apptFilter).map(a => `
    <div class="panel">
      <div class="flex-between">
        <div><b class="mono">${esc(a.ref)}</b> ${stamp(a.status)}</div>
        <span class="muted small">${fmtDateShort(a.date)}</span>
      </div>
      <div class="mt-8"><b>${esc(a.service)}</b></div>
      <div class="muted small">${fmtDate(a.date)} · ${timeRange(a.start_time, a.end_time)}</div>
      ${a.purpose ? `<div class="small mt-8">“${esc(a.purpose)}”</div>` : ''}
      <div class="flex mt-14">
        <button class="btn btn-sm btn-outline" onclick="showQr('${esc(a.ref)}')">Show QR</button>
        ${['Pending', 'Approved'].includes(a.status) ? `
          <button class="btn btn-sm btn-danger" onclick="cancelAppt(${a.id})">Cancel</button>` : ''}
      </div>
    </div>`).join('')}`;
}

/* ---------------- MY REQUESTS ---------------- */
function viewMyRequests() {
  const reqs = state.requests || [];
  return `
  <div class="page-head">
    <div><h2>My Document Requests</h2><div class="sub">${reqs.length} request(s)</div></div>
    <button class="btn btn-primary" onclick="openRequestForm()">+ New Request</button>
  </div>
  <div class="filters">
    ${['', 'Pending', 'Processing', 'Ready for Pickup', 'Completed', 'Cancelled'].map(st => `
      <button class="btn btn-sm ${(state.reqFilter || '') === st ? 'btn-primary' : 'btn-ghost'}"
        onclick="state.reqFilter='${st}';loadView('myRequests')">${st || 'All'}</button>`).join('')}
  </div>
  ${reqs.length === 0 ? '<div class="card empty"><div class="big">📄</div>No document requests yet.</div>' :
    reqs.filter(r => !state.reqFilter || r.status === state.reqFilter).map(r => `
    <div class="panel">
      <div class="flex-between">
        <div><b class="mono">${esc(r.ref)}</b> ${stamp(r.status)}</div>
        <span class="muted small">${fmtDateShort(String(r.created_at).slice(0, 10))}</span>
      </div>
      <div class="mt-8"><b>${esc(r.doc_type)}</b> × ${r.quantity}</div>
      <div class="muted small">Purpose: ${esc(r.purpose || '—')}${r.pickup_date ? ' · Pickup: ' + fmtDateShort(r.pickup_date) : ''}</div>
      ${r.notes ? `<div class="small mt-8">Notes: ${esc(r.notes)}</div>` : ''}
      <div class="flex mt-14">
        <button class="btn btn-sm btn-primary" onclick="Chat.openThread(${r.id})">💬 Chat</button>
        <button class="btn btn-sm btn-outline" onclick="showQr('${esc(r.ref)}')">Show QR</button>
        ${['Pending', 'Processing'].includes(r.status) ? `
          <button class="btn btn-sm btn-danger" onclick="cancelRequest(${r.id})">Cancel</button>` : ''}
      </div>
    </div>`).join('')}`;
}

/* ---------------- NOTIFICATIONS ---------------- */
function viewNotifications() {
  const notifs = state.notifs || [];
  return `
  <div class="page-head">
    <div><h2>Notifications</h2><div class="sub">${notifs.filter(n => !n.is_read).length} unread</div></div>
    <div class="flex">
      <button class="btn btn-sm btn-ghost" onclick="toggleNotifSound()">${notifSoundOn() ? 'Sound: ON' : 'Sound: OFF'}</button>
      <button class="btn btn-sm btn-ghost" onclick="markAllRead()">Mark all read</button>
      ${themeBtnHTML()}
    </div>
  </div>
  ${notifs.length === 0 ? '<div class="card empty"><div class="big">🔔</div>No notifications yet.</div>' :
    notifs.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="markNotifRead(${n.id})" style="cursor:pointer;">
      <div class="nic">${n.kind === 'request' ? '📄' : (n.kind === 'chat' ? '✉' : '🗓️')}</div>
      <div>
        <div class="ntitle">${esc(n.title)}</div>
        <div class="nbody">${esc(n.body)}</div>
        <div class="ntime">${fmtDateShort(String(n.created_at).slice(0, 10))} ${String(n.created_at).slice(11, 16)}</div>
      </div>
    </div>`).join('')}`;
}

/* ---------------- CUSTOMER SERVICE ---------------- */
function viewService() {
  const msgs = state.chats || [];
  const anns = state.anns || [];
  return `
  <div class="page-head"><h2>Customer Service <span class="sub">Ask the registrar</span></h2>${themeBtnHTML()}</div>

  <div class="panel">
    <div class="panel-title">Send an inquiry</div>
    ${state.error ? `<div class="error-box">${esc(state.error)}</div>` : ''}
    <div class="field"><label>Subject</label>
      <input class="input" id="ch-subject" placeholder="e.g., Question about Form 137"></div>
    <div class="field"><label>Message</label>
      <textarea class="input" id="ch-body" placeholder="Type your question or concern…"></textarea></div>
    <button class="btn btn-primary" onclick="sendChat()">Send message</button>
  </div>

  <div class="panel">
    <div class="panel-title">My messages</div>
    ${msgs.length === 0 ? '<div class="empty">No messages yet.</div>' : `
    <div class="chat-list">${msgs.map(m => `
      <div class="chat-item">
        <div class="who"><span>${esc(m.subject)}</span>${stamp(m.status)}</div>
        <div class="msg">${esc(m.body)}</div>
        <div class="chat-time">${fmtDateShort(String(m.created_at).slice(0, 10))}</div>
        ${m.admin_reply ? `<div class="chat-reply"><b>Registrar:</b> ${esc(m.admin_reply)}</div>` : ''}
      </div>`).join('')}</div>`}
  </div>

  ${anns.length ? `<div class="panel"><div class="panel-title">Registrar Announcements</div>
    ${anns.map(a => annHTML(a)).join('')}</div>` : ''}`;
}

/* ---------------- MY QR ---------------- */
function viewMyQr() {
  const me = state.me || {};
  const st = me.student || {};
  const appts = (state.appts || []).filter(a => ['Pending', 'Approved', 'Confirmed'].includes(a.status));
  const reqs = (state.requests || []).filter(r => ['Pending', 'Processing', 'Ready for Pickup'].includes(r.status));
  const stuCode = 'STU-' + (st.student_number || me.id);
  return `
  <div class="page-head"><h2>My QR Code</h2>${themeBtnHTML()}</div>

  <div class="panel" style="text-align:center;">
    <div class="muted small">Student verification code — show this at the registrar counter.</div>
    <div class="qr-box" id="qr-stu"></div>
    <div class="qr-ref">${esc(stuCode)}</div>
  </div>

  ${appts.length || reqs.length ? `
  <div class="panel">
    <div class="panel-title">QR codes for active transactions</div>
    <div class="quick-grid">
      ${appts.map(a => `<button class="quick-tile" onclick="showQr('${esc(a.ref)}')">
        <span class="ic">🗓️</span>${esc(a.ref)}<span class="muted small">${esc(a.service)}</span></button>`).join('')}
      ${reqs.map(r => `<button class="quick-tile" onclick="showQr('${esc(r.ref)}')">
        <span class="ic">📄</span>${esc(r.ref)}<span class="muted small">${esc(r.doc_type)}</span></button>`).join('')}
    </div>
  </div>` : ''}

  <div class="panel">
    <div class="panel-title">How it works</div>
    <ol class="small" style="padding-left:20px;display:flex;flex-direction:column;gap:6px;">
      <li>Show your QR code when you arrive at the registrar.</li>
      <li>The registrar scans it to instantly see your transaction — no paperwork needed.</li>
      <li>Only your name, transaction and status are shown — personal details stay private.</li>
    </ol>
  </div>`;
}

/* ---------------- PROFILE ---------------- */
function viewProfile() {
  const me = state.me || {};
  const st = me.student || {};
  const avatar = st.profile_photo
    ? `<img src="${st.profile_photo}" alt="Profile" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid var(--border);">`
    : initials(st.first_name ? st.first_name + ' ' + st.last_name : me.name);
  return `
  <div class="page-head"><h2>My Profile</h2>${themeBtnHTML()}</div>
  <div class="panel">
    <div class="flex" style="gap:14px;align-items:center;">
      <div class="auth-badge" style="margin:0;overflow:hidden;">${avatar}</div>
      <div>
        <h3>${esc(st.first_name ? [st.first_name, st.middle_name, st.last_name].filter(Boolean).join(' ') : me.name)}</h3>
        <div class="muted small">${esc(me.email)}</div>
        <label class="btn btn-outline btn-sm mt-8" style="display:inline-block;cursor:pointer;">
          📷 ${st.profile_photo ? 'Change photo' : 'Add photo'}
          <input type="file" accept="image/*" style="display:none;" onchange="uploadProfilePhoto(this)">
        </label>
      </div>
    </div>
    <hr class="hr">
    <div class="kv"><span class="k">LRN</span><span class="v mono">${esc(st.student_number || '—')}</span></div>
    <div class="kv"><span class="k">Grade / Level</span><span class="v">${esc(st.grade_level || '—')}</span></div>
    <div class="kv"><span class="k">Strand</span><span class="v">${esc(st.strand || '—')}</span></div>
    <div class="kv"><span class="k">Contact</span><span class="v">${esc(st.contact || '—')}</span></div>
    <div class="kv"><span class="k">Status</span><span class="v">${stamp(st.status || 'active')}</span></div>
  </div>
  <div class="panel">
    <div class="panel-title">Account</div>
    <div class="kv"><span class="k">Email</span><span class="v">${esc(me.email)}</span></div>
    <div class="kv"><span class="k">Role</span><span class="v">${esc(me.role)}</span></div>
    <div class="kv"><span class="k">Server</span><span class="v mono">${esc(Api.base || window.location.origin)}</span></div>
    <div class="flex mt-14" style="gap:10px;flex-wrap:wrap;">
      <button class="btn btn-outline" onclick="go('changePassword')">Change password</button>
      <button class="btn btn-outline" onclick="changeServer()">Change server</button>
      <button class="btn btn-danger" onclick="askLogout()">Log out</button>
    </div>
  </div>`;
}
