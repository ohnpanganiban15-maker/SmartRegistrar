/* =====================================================
   views/admin.js — all registrar/admin screens
===================================================== */

/* ---------------- ADMIN DASHBOARD ---------------- */
function viewAdminDashboard() {
  const s = state.stats || {};
  const upcoming = groupByDate((state.slots || [])
    .filter(x => x.date >= todayISO() && x.status !== 'closed'))
    .slice(0, 5);
  const months = (state.reports && state.reports.requestsByMonth) || [];

  return `
  <div class="page-head">
    <div><h2>Registrar Dashboard</h2><div class="sub">Overview of requests, students and pickup schedule</div></div>
    ${themeBtnHTML()}
  </div>

  <div class="stat-grid">
    <div class="stat-card"><div class="n">${s.totalStudents || 0}</div><div class="l">Total Students</div></div>
    <div class="stat-card gold"><div class="n">${s.pendingRequests || 0}</div><div class="l">Pending Requests</div></div>
    <div class="stat-card"><div class="n">${s.processingRequests || 0}</div><div class="l">Processing</div></div>
    <div class="stat-card green"><div class="n">${s.completedRequests || 0}</div><div class="l">Completed Requests</div></div>
    <div class="stat-card red"><div class="n">${s.cancelledRequests || 0}</div><div class="l">Cancelled / Rejected</div></div>
  </div>

  <div class="grid-2">
    <div class="panel">
      <div class="panel-title">
        <span>Upcoming Pickup Schedule</span>
        <button class="btn btn-sm btn-primary" onclick="go('adminAvailability')">+ Set schedule</button>
      </div>
      ${upcoming.length === 0 ? '<div class="empty">No pickup schedule yet — click "Set schedule" to add slots.</div>' :
        upcoming.map(([date, rows]) => `
        <div class="slot-group">
          <div class="slot-date-head"><div class="d">${fmtDate(date)}</div>
            <div class="w">${rows.length} slot(s)</div></div>
          <div class="slot-chips">${rows.map(x => `
            <span class="slot-chip">${timeRange(x.start_time, x.end_time)}</span>`).join('')}
          </div>
        </div>`).join('')}
      <button class="btn btn-sm btn-ghost mt-8" onclick="go('adminAvailability')">Manage pickup schedule →</button>
    </div>

    <div class="panel">
      <div class="panel-title">Requests This Month</div>
      ${months.length ? barChart(months.map(m => ({ label: m.month, value: m.c })), 'var(--primary)')
        : '<div class="empty">No data yet.</div>'}
      <hr class="hr">
      <div class="panel-title">Quick Actions</div>
      <div class="quick-grid">
        <button class="quick-tile" onclick="go('adminAvailability')"><span class="ic">◔</span>Pickup Schedule</button>
        <button class="quick-tile" onclick="go('adminRequests')"><span class="ic">▤</span>Requests</button>
        <button class="quick-tile" onclick="go('adminScanner')"><span class="ic">▣</span>Scan QR</button>
      </div>
      ${s.openChats ? `<div class="mt-14"><span class="pill-count">${s.openChats}</span>
        <span class="small muted">unanswered inquiry(s)</span>
        <button class="btn btn-sm btn-ghost" onclick="go('adminService')">Open Customer Service</button></div>` : ''}
    </div>
  </div>`;
}

/* ---------------- STUDENT RECORDS ---------------- */
function viewAdminStudents() {
  const f = state.studentFilter || {};
  let list = state.students || [];
  if (f.search) {
    const l = f.search.toLowerCase();
    list = list.filter(s =>
      (s.first_name + ' ' + s.last_name + ' ' + s.student_number + ' ' + (s.email || '')).toLowerCase().includes(l));
  }
  if (f.grade) list = list.filter(s => s.grade_level === f.grade);
  if (f.status) list = list.filter(s => s.status === f.status);
  return `
  <div class="page-head">
    <div><h2>Student Records</h2><div class="sub">${list.length} student(s)</div></div>
    <button class="btn btn-primary" onclick="openStudentForm()">+ Add Student</button>
  </div>
  <div class="filters">
    <input class="input" id="sf-search" placeholder="Search name, number, email…" value="${esc(f.search || '')}"
      oninput="filterStudentsSearch(this.value)">
    <select class="input" onchange="state.studentFilter.grade=this.value;render()">
      <option value="">All grades</option>
      ${['7', '8', '9', '10', '11', '12'].map(g =>
        `<option value="${g}" ${f.grade === g ? 'selected' : ''}>Grade ${g}</option>`).join('')}
    </select>
    <select class="input" onchange="state.studentFilter.status=this.value;render()">
      <option value="">All statuses</option>
      <option value="active" ${f.status === 'active' ? 'selected' : ''}>Active</option>
      <option value="inactive" ${f.status === 'inactive' ? 'selected' : ''}>Inactive</option>
    </select>
  </div>
  ${list.length === 0 ? '<div class="card empty"><div class="big">👥</div>No students found.</div>' : `
  <div class="table-wrap"><table class="rtable">
    <thead><tr><th>LRN</th><th>Name</th><th>Grade</th><th>Strand</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${list.map(s => `
      <tr>
        <td data-label="LRN" class="mono">${esc(s.student_number)}</td>
        <td data-label="Name"><b>${esc(s.first_name + ' ' + s.last_name)}</b></td>
        <td data-label="Grade">${esc(s.grade_level)}</td>
        <td data-label="Strand">${esc(s.strand)}</td>
        <td data-label="Contact">${esc(s.contact || '—')}</td>
        <td data-label="Status">${stamp(s.status)}${s.account_status === 'disabled' ? ' ' + stamp('disabled') : ''}</td>
        <td class="cell-actions" data-label="">
          <button class="btn btn-sm btn-ghost" onclick="viewStudentProfile(${s.id})">View</button>
          <button class="btn btn-sm btn-outline" onclick="openStudentForm(${s.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteStudent(${s.id})">Delete</button>
        </td>
      </tr>`).join('')}</tbody>
  </table></div>`}`;
}

function studentFormHTML(s) {
  s = s || {};
  const isNew = !s.id;
  return `
  <div class="modal-head">
    <div class="modal-title">${isNew ? 'Add Student' : 'Edit Student'}</div>
    <button class="modal-x" onclick="closeModal()">✕</button>
  </div>
  <div class="modal-body">
    <div id="sf-error"></div>
    <div class="form-row">
      <div class="field"><label>LRN *</label>
        <input class="input" id="sf-num" value="${esc(s.student_number || '')}" required></div>
      <div class="field"><label>Email</label>
        <input class="input" id="sf-email" type="email" value="${esc(s.email || '')}"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>First Name *</label>
        <input class="input" id="sf-first" value="${esc(s.first_name || '')}" required></div>
      <div class="field"><label>Last Name *</label>
        <input class="input" id="sf-last" value="${esc(s.last_name || '')}" required></div>
    </div>
    <div class="field"><label>Middle Name</label>
      <input class="input" id="sf-middle" value="${esc(s.middle_name || '')}"></div>
    <div class="form-row">
      <div class="field"><label>Grade / Level</label>
        <input class="input" id="sf-grade" value="${esc(s.grade_level || '')}"></div>
      <div class="field"><label>Strand / Course</label>
        <input class="input" id="sf-strand" value="${esc(s.strand || '')}"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Contact</label>
        <input class="input" id="sf-contact" value="${esc(s.contact || '')}"></div>
      <div class="field"><label>Record status</label>
        <select class="input" id="sf-status">
          <option value="active" ${s.status !== 'inactive' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${s.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select></div>
    </div>
    ${!isNew ? `<div class="field"><label>Login account</label>
      <select class="input" id="sf-acct">
        <option value="">— keep as is —</option>
        <option value="active" ${s.account_status === 'active' ? 'selected' : ''}>Account enabled</option>
        <option value="disabled" ${s.account_status === 'disabled' ? 'selected' : ''}>Account disabled (cannot log in)</option>
      </select></div>` : ''}
  </div>
  <div class="modal-actions">
    <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveStudent(${s.id || 'null'})">${isNew ? 'Add student' : 'Save changes'}</button>
  </div>`;
}

/* ---------------- APPOINTMENTS ---------------- */
function viewAdminAppointments() {
  const f = state.apptAdminFilter || {};
  let list = state.appts || [];
  if (f.search) {
    const l = f.search.toLowerCase();
    list = list.filter(a =>
      (a.ref + ' ' + a.student_name + ' ' + a.service).toLowerCase().includes(l));
  }
  if (f.status) list = list.filter(a => a.status === f.status);
  if (f.from) list = list.filter(a => a.date >= f.from);
  if (f.to) list = list.filter(a => a.date <= f.to);
  return `
  <div class="page-head">
    <div><h2>Appointment Management</h2><div class="sub">${list.length} appointment(s)</div></div>
    ${themeBtnHTML()}
  </div>
  <div class="filters">
    <input class="input" id="as-search" placeholder="Search ref, student, service…" value="${esc(f.search || '')}"
      oninput="filterApptsSearch(this.value)">
    <select class="input" onchange="state.apptAdminFilter.status=this.value;render()">
      <option value="">All statuses</option>
      ${['Pending', 'Approved', 'Confirmed', 'Completed'].map(st =>
        `<option ${f.status === st ? 'selected' : ''}>${st}</option>`).join('')}
    </select>
    <input class="input" type="date" title="From" value="${esc(f.from || '')}"
      onchange="state.apptAdminFilter.from=this.value;render()">
    <input class="input" type="date" title="To" value="${esc(f.to || '')}"
      onchange="state.apptAdminFilter.to=this.value;render()">
    ${(f.search || f.status || f.from || f.to) ?
      '<button class="btn btn-sm btn-ghost" onclick="state.apptAdminFilter={search:\'\',status:\'\',from:\'\',to:\'\'};render()">Clear</button>' : ''}
  </div>
  ${list.length === 0 ? '<div class="card empty"><div class="big">🗓️</div>No appointments match.</div>' : `
  <div class="table-wrap"><table class="rtable">
    <thead><tr><th>Ref</th><th>Student</th><th>Service</th><th>Date &amp; Time</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${list.map(a => `
      <tr>
        <td data-label="Ref" class="mono">${esc(a.ref)}</td>
        <td data-label="Student"><b>${esc(a.student_name)}</b></td>
        <td data-label="Service">${esc(a.service)}${a.purpose ? `<div class="muted small">“${esc(a.purpose)}”</div>` : ''}</td>
        <td data-label="Date & Time">${fmtDateShort(a.date)}<div class="muted small">${timeRange(a.start_time, a.end_time)}</div></td>
        <td data-label="Status">${stamp(a.status)}</td>
        <td class="cell-actions" data-label="">
          <button class="btn btn-sm btn-ghost" onclick="showQr('${esc(a.ref)}')">QR</button>
          ${a.status === 'Pending' ? `
            <button class="btn btn-sm btn-success" onclick="setApptStatus(${a.id},'Approved')">Approve</button>` : ''}
          ${['Approved', 'Confirmed'].includes(a.status) ? `
            <button class="btn btn-sm btn-success" onclick="setApptStatus(${a.id},'Completed')">Complete</button>
            <button class="btn btn-sm btn-outline" onclick="openReschedule(${a.id})">Reschedule</button>` : ''}
          ${['Pending', 'Approved', 'Confirmed'].includes(a.status) ? `
            <button class="btn btn-sm btn-danger" onclick="setApptStatus(${a.id},'Cancelled')">Cancel</button>` : ''}
          ${['Completed', 'Cancelled', 'Rejected'].includes(a.status) ? '<span class="muted small">—</span>' : ''}
        </td>
      </tr>`).join('')}</tbody>
  </table></div>`}`;
}

/* ---------------- DOCUMENT REQUESTS ---------------- */
function viewAdminRequests() {
  const statuses = ['Pending', 'Processing', 'Ready for Pickup', 'Completed'];
  const f = state.reqAdminFilter || {};
  let list = state.requests || [];
  if (f.search) {
    const l = f.search.toLowerCase();
    list = list.filter(r =>
      (r.ref + ' ' + r.student_name + ' ' + r.doc_type).toLowerCase().includes(l));
  }
  if (f.status) list = list.filter(r => r.status === f.status);
  return `
  <div class="page-head">
    <div><h2>Document Requests</h2><div class="sub">${list.length} request(s)</div></div>
    ${themeBtnHTML()}
  </div>
  <div class="filters">
    <input class="input" id="rs-search" placeholder="Search ref, student, type…" value="${esc(f.search || '')}"
      oninput="filterReqsSearch(this.value)">
    <select class="input" onchange="state.reqAdminFilter.status=this.value;render()">
      <option value="">All statuses</option>
      ${statuses.map(st => `<option ${f.status === st ? 'selected' : ''}>${st}</option>`).join('')}
    </select>
  </div>
  ${list.length === 0 ? '<div class="card empty"><div class="big">📄</div>No requests match.</div>' : `
  <div class="table-wrap"><table class="rtable">
    <thead><tr><th>Ref</th><th>Student</th><th>Document</th><th>Pickup</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${list.map(r => `
      <tr>
        <td data-label="Ref" class="mono">${esc(r.ref)}</td>
        <td data-label="Student"><b>${esc(r.student_name)}</b></td>
        <td data-label="Document">${esc(r.doc_type)} × ${r.quantity}
          <div class="muted small">${esc(r.purpose || '')}</div></td>
        <td data-label="Pickup">${r.pickup_date ? fmtDateShort(r.pickup_date) : '—'}</td>
        <td data-label="Status">${stamp(r.status)}</td>
        <td class="cell-actions" data-label="">
          <button class="btn btn-sm btn-ghost" onclick="showQr('${esc(r.ref)}')">QR</button>
          ${statuses.filter(st => st !== r.status).map(st => {
            const cls = st === 'Completed' || st === 'Ready for Pickup' ? 'btn-success' :
              (st === 'Rejected' || st === 'Cancelled' ? 'btn-danger' : 'btn-outline');
            return `<button class="btn btn-sm ${cls}" onclick="setReqStatus(${r.id},'${st}')">${st}</button>`;
          }).join('')}
        </td>
      </tr>`).join('')}</tbody>
  </table></div>`}`;
}

/* ---------------- AVAILABILITY ---------------- */
function viewAdminAvailability() {
  const slots = state.slots || [];
  const byDate = groupByDate(slots);
  return `
  <div class="page-head">
    <div><h2>Pickup Schedule</h2><div class="sub">Set the dates and times when students can pick up their documents</div></div>
    <button class="btn btn-primary" onclick="openSlotForm()">+ Add Slot</button>
  </div>

  <div class="panel">
    <div class="panel-title">Add a slot</div>
    <div class="form-row">
      <div class="field"><label>Date</label><input class="input" type="date" id="sl-date" min="${todayISO()}"></div>
      <div class="field"><label>Start time</label><input class="input" type="time" id="sl-start" value="08:00"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>End time</label><input class="input" type="time" id="sl-end" value="09:00"></div>
      <div class="field" style="display:flex;align-items:flex-end;">
        <button class="btn btn-primary btn-block" onclick="saveSlot(null)">Add slot</button>
      </div>
    </div>
  </div>

  ${byDate.length === 0 ? '<div class="card empty"><div class="big">◔</div>No slots yet — add your first one above.</div>' :
    byDate.map(([date, rows]) => {
      const allClosed = rows.every(r => r.status === 'closed');
      return `
      <div class="panel">
        <div class="panel-title">
          <span>${fmtDate(date)}</span>
          <span class="flex">
            <span class="muted small">${rows.length} slot(s)</span>
            <button class="btn btn-sm ${allClosed ? 'btn-success' : 'btn-danger'}"
              onclick="toggleCloseDate('${date}',${allClosed ? "'available'" : "'closed'"})">
              ${allClosed ? 'Reopen day' : 'Close whole day'}</button>
          </span>
        </div>
        <div class="table-wrap"><table class="rtable">
          <thead><tr><th>Time</th><th>Status</th><th>Bookings</th><th>Actions</th></tr></thead>
          <tbody>${rows.map(x => `
            <tr>
              <td data-label="Time"><b>${timeRange(x.start_time, x.end_time)}</b></td>
              <td data-label="Status">
                <span class="stamp ${x.status === 'closed' ? 'st-cancelled' : 'st-approved'}">
                  ${x.status === 'closed' ? 'Closed' : 'Open'}</span></td>
              <td data-label="Bookings">${x.booked > 0 ? `<span class="pill-count">${x.booked}</span>` : '0'}</td>
              <td class="cell-actions" data-label="">
                ${x.status === 'available'
                  ? `<button class="btn btn-sm btn-outline" onclick="setSlotStatus(${x.id},'closed')">Close</button>`
                  : `<button class="btn btn-sm btn-success" onclick="setSlotStatus(${x.id},'available')">Open</button>`}
                ${x.booked === 0 ? `<button class="btn btn-sm btn-danger" onclick="deleteSlot(${x.id})">Delete</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
    }).join('')}`;
}

/* ---------------- QR SCANNER ---------------- */
function viewAdminScanner() {
  return `
  <div class="page-head"><h2>QR Scanner <span class="sub">Scan or type a reference code</span></h2>${themeBtnHTML()}</div>

  <div class="panel">
    <div class="panel-title">Scan with camera</div>
    <div id="scan-area">
      <button class="btn btn-primary" onclick="startCamera()">Start camera</button>
      <div class="form-hint">Camera scanning needs a secure page (localhost or HTTPS). On a plain
        <span class="mono">http://IP</span> address, use manual entry below instead — or open this
        page on the computer itself.</div>
    </div>
    <div id="scan-result" class="mt-14"></div>
  </div>

  <div class="panel">
    <div class="panel-title">Manual lookup</div>
    <div class="flex">
      <input class="input" id="scan-code" placeholder="e.g. APT-0001, REQ-0001, STU-S-2026-00121"
        style="flex:1;min-width:220px;">
      <button class="btn btn-primary" onclick="lookupCode()">Look up</button>
    </div>
    <div class="form-hint">Students show these codes as QR — type the same text here if the camera is unavailable.</div>
  </div>`;
}

/* ---------------- ANNOUNCEMENTS ---------------- */
function viewAdminAnnouncements() {
  const anns = state.anns || [];
  return `
  <div class="page-head"><h2>Announcements</h2>${themeBtnHTML()}</div>
  <div class="panel">
    <div class="panel-title">Post a new announcement</div>
    <div class="field"><label>Title</label><input class="input" id="an-title" placeholder="e.g., Clearance schedule"></div>
    <div class="field"><label>Message</label><textarea class="input" id="an-body" placeholder="Write the announcement…"></textarea></div>
    <button class="btn btn-primary" onclick="saveAnnouncement()">Post announcement</button>
  </div>
  ${anns.length === 0 ? '<div class="card empty"><div class="big">📢</div>No announcements yet.</div>' :
    anns.map(a => `
    <div class="panel">
      <div class="flex-between">
        <div><b>${esc(a.title)}</b></div>
        <button class="btn btn-sm btn-danger" onclick="deleteAnnouncement(${a.id})">Delete</button>
      </div>
      <div class="mt-8">${esc(a.body)}</div>
      <div class="muted small mt-8">Posted ${fmtDateShort(String(a.created_at).slice(0, 10))}</div>
    </div>`).join('')}`;
}

/* ---------------- CUSTOMER SERVICE (admin) ---------------- */
function viewAdminService() {
  const msgs = state.chats || [];
  const f = state.chatFilter || '';
  const list = msgs.filter(m => !f || m.status === f);
  return `
  <div class="page-head">
    <div><h2>Customer Service</h2><div class="sub">${msgs.filter(m => m.status === 'Open').length} open inquiry(s)</div></div>
    ${themeBtnHTML()}
  </div>
  <div class="filters">
    ${['', 'Open', 'Resolved'].map(st => `
      <button class="btn btn-sm ${f === st ? 'btn-primary' : 'btn-ghost'}"
        onclick="state.chatFilter='${st}';loadView('adminService')">${st || 'All'}</button>`).join('')}
  </div>
  ${list.length === 0 ? '<div class="card empty"><div class="big">✉</div>No messages.</div>' :
    list.map(m => `
    <div class="chat-item" style="margin-bottom:12px;">
      <div class="who"><span>${esc(m.student_name)} · ${esc(m.subject)}</span>${stamp(m.status)}</div>
      <div class="msg">${esc(m.body)}</div>
      <div class="chat-time">${fmtDateShort(String(m.created_at).slice(0, 10))}</div>
      ${m.admin_reply ? `<div class="chat-reply"><b>You replied:</b> ${esc(m.admin_reply)}</div>` : ''}
      <div class="flex mt-14">
        ${!m.admin_reply ? `<button class="btn btn-sm btn-primary" onclick="openReply(${m.id})">Reply</button>` : ''}
        ${m.status === 'Open' ? `<button class="btn btn-sm btn-outline" onclick="resolveMsg(${m.id})">Mark resolved</button>` : ''}
      </div>
    </div>`).join('')}`;
}

/* ---------------- ACTIVITY LOGS ---------------- */
function viewAdminLogs() {
  const logs = state.logs || [];
  return `
  <div class="page-head"><h2>System Activity Logs</h2>${themeBtnHTML()}</div>
  ${logs.length === 0 ? '<div class="card empty">No activity recorded yet.</div>' : `
  <div class="table-wrap"><table class="rtable">
    <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
    <tbody>${logs.map(l => `
      <tr>
        <td data-label="Time" class="small">${String(l.created_at).replace('T', ' ').slice(0, 16)}</td>
        <td data-label="User">${esc(l.user_name)}</td>
        <td data-label="Action"><span class="mono">${esc(l.action)}</span></td>
        <td data-label="Details" class="small">${esc(l.details)}</td>
      </tr>`).join('')}</tbody>
  </table></div>`}`;
}

/* ---------------- REPORTS ---------------- */
function viewAdminReports() {
  const r = state.reports;
  if (!r) return loadingHTML('Loading reports…');
  const apptColors = {
    Pending: 'var(--warning)', Approved: 'var(--info)', Confirmed: 'var(--info)',
    Completed: 'var(--success)', Cancelled: 'var(--danger)', Rejected: 'var(--danger)'
  };
  return `
  <div class="page-head"><h2>Reports</h2>${themeBtnHTML()}</div>

  <div class="grid-2">
    <div class="panel">
      <div class="panel-title">Appointments by status</div>
      ${r.appointmentsByStatus.length ? barChart(
        r.appointmentsByStatus.map(x => ({
          label: x.status, value: x.c,
          color: apptColors[x.status] || 'var(--primary)'
        }))) : '<div class="empty">No data.</div>'}
    </div>
    <div class="panel">
      <div class="panel-title">Document requests by status</div>
      ${r.requestsByStatus.length ? barChart(
        r.requestsByStatus.map(x => ({ label: x.status, value: x.c })), 'var(--accent)') : '<div class="empty">No data.</div>'}
    </div>
  </div>

  <div class="grid-2">
    <div class="panel">
      <div class="panel-title">Appointments per month (last 6 months)</div>
      ${r.appointmentsByMonth.length ? barChart(
        r.appointmentsByMonth.map(x => ({ label: x.month, value: x.c })), 'var(--primary)') : '<div class="empty">No data.</div>'}
    </div>
    <div class="panel">
      <div class="panel-title">Requests per month (last 6 months)</div>
      ${r.requestsByMonth.length ? barChart(
        r.requestsByMonth.map(x => ({ label: x.month, value: x.c })), 'var(--accent)') : '<div class="empty">No data.</div>'}
    </div>
  </div>

  <div class="grid-2">
    <div class="panel">
      <div class="panel-title">Top appointment services</div>
      ${r.topServices.length ? barChart(r.topServices.map(x => ({ label: x.service, value: x.c })), 'var(--success)') : '<div class="empty">No data.</div>'}
    </div>
    <div class="panel">
      <div class="panel-title">Most requested documents</div>
      ${r.topDocuments.length ? barChart(r.topDocuments.map(x => ({ label: x.doc_type, value: x.c })), 'var(--accent-deep)') : '<div class="empty">No data.</div>'}
    </div>
  </div>`;
}
