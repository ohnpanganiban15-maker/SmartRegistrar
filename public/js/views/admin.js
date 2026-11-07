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
    <div><h2>Registrar Dashboard</h2>
      <div class="sub">${schoolYear()} · ${currentSem()} · Overview of requests, students and pickup schedule</div></div>
    
  </div>

  <div class="stat-grid">
    <div class="stat-card"><div class="sic">👥</div><div class="n">${s.totalStudents || 0}</div><div class="l">Total Students</div></div>
    <div class="stat-card gold"><div class="sic">🕓</div><div class="n">${s.pendingRequests || 0}</div><div class="l">Pending Requests</div></div>
    <div class="stat-card"><div class="sic">⚙️</div><div class="n">${s.processingRequests || 0}</div><div class="l">Processing</div></div>
    <div class="stat-card green"><div class="sic">📦</div><div class="n">${s.readyRequests || 0}</div><div class="l">Ready for Pickup</div></div>
    <div class="stat-card green"><div class="sic">✅</div><div class="n">${s.completedRequests || 0}</div><div class="l">Completed</div></div>
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
      ${['11', '12'].map(g =>
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
    <div class="flex">
      ${(state.appts || []).some(a => a.status === 'Pending') ? `
        <button class="btn btn-sm btn-success" onclick="approveAllAppts()">✔ Approve all pending</button>` : ''}
      <button class="btn btn-sm btn-ghost" onclick="go('adminQueue')" title="Digital queue board">🎫 Queue board</button>
    </div>
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
    <thead><tr><th>Ref</th><th>Student</th><th>Service</th><th>Date &amp; Time</th><th>Status</th><th>Queue</th><th>Actions</th></tr></thead>
    <tbody>${list.map(a => `
      <tr>
        <td data-label="Ref" class="mono">${esc(a.ref)}</td>
        <td data-label="Student"><b>${esc(a.student_name)}</b></td>
        <td data-label="Service">${esc(a.service)}${a.purpose ? `<div class="muted small">“${esc(a.purpose)}”</div>` : ''}</td>
        <td data-label="Date & Time">${fmtDateShort(a.date)}<div class="muted small">${timeRange(a.start_time, a.end_time)}</div></td>
        <td data-label="Status">${stamp(a.status)}</td>
        <td data-label="Queue" class="small">${a.queue_no && !['Cancelled', 'Rejected'].includes(a.status) ? '#' + a.queue_no : '—'}
          ${a.queue_state === 'serving' ? '<span class="stamp st-approved">Serving</span>' : ''}
          ${a.no_show ? '<span class="stamp st-cancelled">No-show</span>' : ''}</td>
        <td class="cell-actions" data-label="">
          <button class="btn btn-sm btn-ghost" onclick="showQr('${esc(a.ref)}')">QR</button>
          ${a.status === 'Pending' ? `
            <button class="btn btn-sm btn-success" onclick="setApptStatus(${a.id},'Approved')">Approve</button>` : ''}
          ${['Approved', 'Confirmed'].includes(a.status) ? `
            <button class="btn btn-sm btn-success" onclick="setApptStatus(${a.id},'Completed')">Complete</button>
            <button class="btn btn-sm btn-outline" onclick="openReschedule(${a.id})">Reschedule</button>` : ''}
          ${['Pending', 'Approved', 'Confirmed'].includes(a.status) ? `
            <button class="btn btn-sm btn-danger" onclick="setApptStatus(${a.id},'Cancelled')">Cancel</button>
            <button class="btn btn-sm btn-ghost" onclick="markNoShow(${a.id})" title="Student did not arrive">No-show</button>` : ''}
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
        <td data-label="Pickup">
          ${r.status === 'Completed'
            ? `<span class="pickup-locked" title="Completed — the pickup schedule can no longer be edited">🔒 ${r.pickup_date
                ? esc(fmtDateShort(r.pickup_date)) + (r.pickup_time ? ' · ' + esc(fmtTime(r.pickup_time)) : '')
                : '<span class="muted">Locked</span>'}</span>`
            : `<button class="btn btn-sm btn-ghost" onclick="editPickup(${r.id})"
                title="Set or edit the pickup date and time">
                ${r.pickup_date
                  ? esc(fmtDateShort(r.pickup_date)) + (r.pickup_time ? ' · ' + esc(fmtTime(r.pickup_time)) : '')
                  : '<span class="muted">+ Set</span>'}
              </button>
              ${r.claimed_at ? `<div class="muted small claim-tick"
                title="The request auto-completes 24 hours after it was scanned">⏱ auto-complete
                ${esc(claimDeadlineText(r.claimed_at))} · ${esc(claimTimeLeft(r.claimed_at))}</div>` : ''}`}
        </td>
        <td data-label="Status">${stamp(r.status)}</td>
        <td class="cell-actions" data-label="">
          <button class="btn btn-sm btn-ghost" onclick="showQr('${esc(r.ref)}')">QR</button>
          <button class="btn btn-sm btn-ghost" onclick="showTimeline(${r.id})" title="Step-by-step history">🕘 History</button>
          <button class="btn btn-sm btn-outline" onclick="Chat.openThread(${r.id})">💬 Chat</button>
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
  <div class="page-head"><h2>QR Scanner <span class="sub">Scan or type a reference code</span></h2></div>

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
  <div class="page-head"><h2>Announcements</h2></div>
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

/* ---------------- DOCUMENT REQUIREMENTS ---------------- */
function viewAdminDocTypes() {
  const types = state.docTypes || [];
  return `
  <div class="page-head">
    <div><h2>Document Requirements</h2>
      <div class="sub">${types.length} document type(s) · what students see before requesting</div></div>
    <button class="btn btn-primary" onclick="openTypeForm()">+ Add document type</button>
  </div>
  ${types.length === 0 ? '<div class="card empty"><div class="big">📋</div>No document types yet.</div>' : `
  <div class="table-wrap"><table class="rtable">
    <thead><tr><th>Document</th><th>Description</th><th>Requirements</th>
      <th>Processing</th><th>Status</th><th></th></tr></thead>
    <tbody>${types.map(t => `
      <tr${t.is_active ? '' : ' class="row-off"'}>
        <td data-label="Document"><b>${esc(t.name)}</b></td>
        <td data-label="Description" class="small">${esc(t.description || '—')}</td>
        <td data-label="Requirements" class="small">${esc((t.requirements || '').split('\n')[0] || '—')}${(t.requirements || '').indexOf('\n') !== -1 ? ' …' : ''}</td>
        <td data-label="Processing">${Number(t.processing_days) || 1} day(s)</td>
        <td data-label="Status">${t.is_active
          ? '<span class="stamp st-approved">Active</span>'
          : '<span class="stamp st-cancelled">Disabled</span>'}</td>
        <td class="cell-actions" data-label="">
          <button class="btn btn-sm btn-outline" onclick="openTypeForm(${t.id})">Edit</button>
          <button class="btn btn-sm btn-ghost" onclick="toggleType(${t.id})">${t.is_active ? 'Disable' : 'Enable'}</button>
        </td>
      </tr>`).join('')}</tbody>
  </table></div>`}
  <div class="form-hint">Types are disabled, never deleted — past requests keep their original document name.</div>`;
}

function openTypeForm(id) {
  const t = id ? (state.docTypes || []).find(x => x.id === id) : null;
  openModal(`
    <div class="modal-head">
      <div class="modal-title">${t ? 'Edit' : 'Add'} document type</div>
      <button class="modal-x" onclick="closeModal()" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
      <div id="dt-error"></div>
      <div class="field"><label for="dt-name">Document name *</label>
        <input class="input" id="dt-name" value="${esc(t ? t.name : '')}"
          placeholder="e.g., Certificate of Good Character"></div>
      <div class="field"><label for="dt-desc">Description</label>
        <textarea class="input" id="dt-desc"
          placeholder="One line students will read…">${esc(t ? t.description : '')}</textarea></div>
      <div class="field"><label for="dt-req">Requirements (one per line)</label>
        <textarea class="input" id="dt-req" rows="4"
          placeholder="&#8226; Purpose of request&#10;&#8226; Valid school ID">${esc(t ? t.requirements : '')}</textarea></div>
      <div class="field"><label for="dt-days">Processing days</label>
        <input class="input" id="dt-days" type="number" min="0" max="60"
          value="${t ? (Number(t.processing_days) || 0) : 1}"></div>
      ${t ? `<label class="check"><input type="checkbox" id="dt-active" ${t.is_active ? 'checked' : ''}>
        Active — visible to students</label>` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveType(${t ? t.id : 'null'})">${t ? 'Save changes' : 'Create type'}</button>
    </div>`);
}
async function saveType(id) {
  const g = x => ((document.getElementById(x) || {}).value || '').trim();
  const body = {
    name: g('dt-name'), description: g('dt-desc'),
    requirements: g('dt-req')
  };
  const activeEl = document.getElementById('dt-active');
  if (activeEl) body.is_active = activeEl.checked;
  const days = parseInt(g('dt-days'), 10);
  if (Number.isFinite(days)) body.processing_days = days;
  if (!body.name) {
    const e = document.getElementById('dt-error');
    if (e) e.innerHTML = '<div class="error-box">Document name is required.</div>';
    return;
  }
  try {
    if (id) await Api.put('/api/requests/types/' + id, body);
    else await Api.post('/api/requests/types', body);
    closeModal();
    toast(id ? 'Document type updated.' : 'Document type added.');
    await loadView('adminDocTypes');
    render();
  } catch (err) {
    const e = document.getElementById('dt-error');
    if (e) e.innerHTML = '<div class="error-box">' + esc(err.message) + '</div>';
  }
}
async function toggleType(id) {
  const t = (state.docTypes || []).find(x => x.id === id);
  if (!t) return;
  try {
    await Api.put('/api/requests/types/' + id, { is_active: !t.is_active });
    toast(t.is_active ? t.name + ' disabled — students can no longer request it.'
      : t.name + ' enabled.');
    await loadView('adminDocTypes');
    render();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------------- DIGITAL QUEUE ---------------- */
function viewAdminQueue() {
  const qd = state.queue;
  if (!qd) return loadingHTML('Loading the queue…');
  const rows = qd.rows || [];
  const now = qd.serving;
  return `
  <div class="page-head">
    <div><h2>Digital Queue</h2>
      <div class="sub">${fmtDate(qd.date)} · ${rows.length} in line</div></div>
    <div class="flex">
      <input class="input" type="date" value="${esc(qd.date)}" onchange="setQueueDate(this.value)"
        aria-label="Queue date">
      <button class="btn btn-sm btn-ghost" onclick="loadView('adminQueue').then(render)">↻ Refresh</button>
    </div>
  </div>

  <div class="q-board">
    <div class="q-now${now ? '' : ' q-idle'}">
      <div class="q-label">NOW SERVING</div>
      <div class="q-num">${now ? '#' + (now.queue_no || '—') : '—'}</div>
      <div class="q-who">${now ? esc(now.student_name) : 'Nobody called yet'}</div>
      <div class="q-meta">${now ? esc(now.service) + ' · ' + esc(now.ref)
        : 'Call the next student from the list below.'}</div>
    </div>
    <div class="q-stats">
      <div class="q-stat"><b>${qd.waiting || 0}</b><span>waiting</span></div>
      <div class="q-stat"><b>${qd.served || 0}</b><span>served</span></div>
      <div class="q-stat"><b>${rows.length}</b><span>total</span></div>
    </div>
  </div>

  ${rows.length === 0 ? '<div class="card empty"><div class="big">🎫</div>No appointments in the queue for this date.</div>' : `
  <div class="table-wrap"><table class="rtable">
    <thead><tr><th>#</th><th>Student</th><th>Service</th><th>Schedule</th><th>State</th><th>Actions</th></tr></thead>
    <tbody>${rows.map(a => `
      <tr${a.queue_state === 'serving' ? ' class="row-serving"' : ''}>
        <td data-label="#"><b class="q-tag">${a.queue_no || '—'}</b></td>
        <td data-label="Student"><b>${esc(a.student_name)}</b>
          <div class="muted small mono">${esc(a.ref)}</div></td>
        <td data-label="Service">${esc(a.service)}</td>
        <td data-label="Schedule" class="small">${fmtDateShort(a.date)} · ${fmtTime(a.start_time)}</td>
        <td data-label="State">${a.queue_state === 'serving' ? '<span class="stamp st-approved">Now serving</span>'
          : a.queue_state === 'served' ? '<span class="stamp st-completed">Served</span>'
          : '<span class="stamp st-pending">Waiting</span>'}</td>
        <td class="cell-actions" data-label="">
          ${!a.queue_state ? `<button class="btn btn-sm btn-primary" onclick="queueAction(${a.id},'call')">Call</button>` : ''}
          ${a.queue_state === 'serving' ? `
            <button class="btn btn-sm btn-success" onclick="queueAction(${a.id},'served')">Served</button>
            <button class="btn btn-sm btn-danger" onclick="queueAction(${a.id},'noshow')">No-show</button>` : ''}
          ${a.queue_state === 'served' ? '<span class="muted small">Done</span>' : ''}
        </td>
      </tr>`).join('')}</tbody>
  </table></div>`}`;
}

/* ---------------- ANALYTICS (admin) ---------------- */
function rateRing(pct, label, color) {
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  return `
  <div class="rate-ring" style="--p:${p};--c:${color || 'var(--primary)'}">
    <div class="rr-in"><b>${p}%</b><span>${esc(label)}</span></div>
  </div>`;
}
function viewAdminAnalytics() {
  const a = state.analytics;
  if (!a) return loadingHTML('Loading analytics…');
  const rq = a.requests || {}, ap = a.appointments || {}, st = a.students || {};
  const fb = state.feedback || { rows: [], total: 0, avg: 0, dist: [] };
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byDay = ((a.trends && a.trends.byWeekday) || []).map(x => ({ label: days[x.d] !== undefined ? days[x.d] : x.d, value: x.c }));
  const byHour = ((a.trends && a.trends.byHour) || []).map(x => ({ label: String(x.h).padStart(2, '0'), value: x.c }));
  const grades = (st.byGrade || []).map(x => ({ label: x.label, value: x.c }));
  const months = ((a.trends && a.trends.byMonth) || []).map(x => ({ label: x.month, value: x.c }));
  return `
  <div class="page-head">
    <div><h2>Analytics</h2>
      <div class="sub">Performance of requests, appointments and the queue — live from the database</div></div>
    <button class="btn btn-sm btn-ghost" onclick="printReport('summary')">🖨 Print summary</button>
  </div>

  <div class="stat-grid">
    <div class="stat-card green"><div class="sic">✅</div><div class="n">${rq.completionRate || 0}%</div><div class="l">Completion rate</div></div>
    <div class="stat-card"><div class="sic">⏱</div><div class="n">${rq.avgTurnaroundH || 0}h</div><div class="l">Avg. turnaround</div></div>
    <div class="stat-card gold"><div class="sic">🕓</div><div class="n">${rq.backlog || 0}</div><div class="l">Backlog (&gt; 2 days)</div></div>
    <div class="stat-card"><div class="sic">📥</div><div class="n">${rq.today || 0}</div><div class="l">Filed today</div></div>
    <div class="stat-card"><div class="ic">📅</div><div class="n">${ap.showRate || 0}%</div><div class="l">Appointment show rate</div></div>
  </div>

  <div class="grid-2">
    <div class="panel">
      <div class="panel-title">How requests finish</div>
      <div class="ring-row">
        ${rateRing(rq.completionRate, 'completed', 'var(--success)')}
        ${rateRing(rq.within24hRate, 'within 24h', 'var(--accent)')}
        ${rateRing(rq.rejectionRate, 'rejected', 'var(--danger)')}
      </div>
      <div class="muted small mt-8">${rq.completed || 0} of ${rq.total || 0} requests completed ·
        ${rq.claimed || 0} scanned at the counter ·
        avg. claim window ${rq.avgClaimWindowH || 0}h</div>
      <hr class="hr">
      <div class="panel-title">Volume</div>
      <div class="kv"><span class="k">Filed today</span><span class="v">${rq.today || 0}</span></div>
      <div class="kv"><span class="k">Filed last 7 days</span><span class="v">${rq.week || 0}</span></div>
      <div class="kv"><span class="k">Appointments pending</span><span class="v">${ap.pending || 0}</span></div>
      <div class="kv"><span class="k">Students on record</span><span class="v">${st.total || 0}</span></div>
    </div>

    <div class="panel">
      <div class="panel-title">Requests by weekday</div>
      ${byDay.length ? barChart(byDay, 'var(--primary)') : '<div class="empty">No data yet.</div>'}
      <hr class="hr">
      <div class="panel-title">Requests by hour of day</div>
      ${byHour.length ? barChart(byHour, 'var(--accent)') : '<div class="empty">No data yet.</div>'}
    </div>
  </div>

  <div class="grid-2">
    <div class="panel">
      <div class="panel-title">Monthly trend (6 months)</div>
      ${months.length ? barChart(months, 'var(--primary-bright)') : '<div class="empty">No data yet.</div>'}
    </div>
    <div class="panel">
      <div class="panel-title">Students by grade level</div>
      ${grades.length ? barChart(grades, 'var(--success)') : '<div class="empty">No data yet.</div>'}
    </div>
  </div>

  <div class="grid-2">
    <div class="panel">
      <div class="panel-title">Most requested documents</div>
      ${((a.top || {}).documents || []).length ? barChart(a.top.documents.map(x => ({ label: x.label, value: x.c })), 'var(--accent-deep)')
        : '<div class="empty">No data yet.</div>'}
    </div>
    <div class="panel">
      <div class="panel-title">Most active requesters</div>
      ${((a.top || {}).students || []).length ? barChart(a.top.students.map(x => ({ label: x.label, value: x.c })), 'var(--info)')
        : '<div class="empty">No data yet.</div>'}
    </div>
  </div>

  <div class="grid-2">
    <div class="panel">
      <div class="panel-title">⭐ Student feedback</div>
      ${fb.total ? `
      <div class="fb-row">
        <div class="fb-avg"><b>${fb.avg}</b>
          <span class="fb-stars">${'★'.repeat(Math.round(fb.avg))}${'☆'.repeat(5 - Math.round(fb.avg))}</span>
          <div class="muted small">${fb.total} rating(s)</div></div>
        <div class="fb-dist">${(fb.dist || []).slice().reverse().map(d => `
          <div class="fb-bar"><span class="fb-star">${d.rating}★</span>
            <span class="fb-track"><span style="width:${fb.total ? Math.round(d.c / fb.total * 100) : 0}%"></span></span>
            <span class="fb-count">${d.c}</span></div>`).join('')}</div>
      </div>` : '<div class="empty">No ratings yet — students can rate the service from their dashboard.</div>'}
    </div>
    <div class="panel">
      <div class="panel-title">Latest comments</div>
      ${(fb.rows || []).filter(x => x.comment).slice(0, 4).map(x => `
        <div class="fb-cmt"><b>${'★'.repeat(x.rating)}</b> · ${esc(x.student_name)}
          <div class="small">“${esc(x.comment)}”</div></div>`).join('')
        || '<div class="empty">No comments yet.</div>'}
    </div>
  </div>`;
}

/* ---------------- ACTIVITY LOGS ---------------- */
function viewAdminLogs() {
  const logs = state.logs || [];
  const f = state.logFilter || {};
  const fx = state.logFacets || { actions: [], total: 0 };
  const active = !!(f.search || f.action || f.from || f.to);
  return `
  <div class="page-head">
    <div><h2>System Activity Logs</h2>
      <div class="sub">${logs.length} shown · ${fx.total || 0} recorded</div></div>
    <div class="flex">
      <button class="btn btn-sm btn-outline" onclick="window.open('/api/export/logs','_blank','noopener')"
        title="Download every entry as CSV">⬇ CSV</button>
      <button class="btn btn-sm btn-ghost" onclick="printLogs()" title="Print the entries shown">🖨 Print</button>
    </div>
  </div>
  <div class="filters">
    <input class="input" id="lg-search" placeholder="Search user, action or details…"
      value="${esc(f.search || '')}" oninput="setLogFilter('search', this.value, true)">
    <select class="input" onchange="setLogFilter('action', this.value)">
      <option value="">All actions</option>
      ${(fx.actions || []).map(a => `<option value="${esc(a.action)}" ${f.action === a.action ? 'selected' : ''}>${esc(a.action)} (${a.c})</option>`).join('')}
    </select>
    <input class="input" type="date" title="From" aria-label="From date"
      value="${esc(f.from || '')}" onchange="setLogFilter('from', this.value)">
    <input class="input" type="date" title="To" aria-label="To date"
      value="${esc(f.to || '')}" onchange="setLogFilter('to', this.value)">
    ${active ? `<button class="btn btn-sm btn-ghost" onclick="clearLogFilter()">✕ Clear</button>` : ''}
  </div>
  ${logs.length === 0 ? `<div class="card empty"><div class="big">≡</div>${active ? 'No entries match these filters.' : 'No activity recorded yet.'}</div>` : `
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
  const rr = state.reportRange || { from: '', to: '' };
  const apptColors = {
    Pending: 'var(--warning)', Approved: 'var(--info)', Confirmed: 'var(--info)',
    Completed: 'var(--success)', Cancelled: 'var(--danger)', Rejected: 'var(--danger)'
  };
  return `
  <div class="page-head">
    <div><h2>Reports</h2><div class="sub">Charts, analytics and printable official copies</div></div>
  </div>

  <div class="panel">
    <div class="panel-title">🖨 Printable reports</div>
    <div class="form-row">
      <div class="field"><label for="rp-from">From</label>
        <input class="input" type="date" id="rp-from" value="${esc(rr.from || '')}"
          onchange="setReportRange('from', this.value)"></div>
      <div class="field"><label for="rp-to">To</label>
        <input class="input" type="date" id="rp-to" value="${esc(rr.to || '')}"
          onchange="setReportRange('to', this.value)"></div>
    </div>
    <div class="muted small" style="margin-bottom:10px;">
      The date range applies to the requests, appointments and roster sheets (leave both empty for everything).
    </div>
    <div class="quick-grid">
      <button class="quick-tile" onclick="printReport('summary')"><span class="ic">📊</span>Summary</button>
      <button class="quick-tile" onclick="printReport('requests')"><span class="ic">▤</span>Requests</button>
      <button class="quick-tile" onclick="printReport('appointments')"><span class="ic">📅</span>Appointments</button>
      <button class="quick-tile" onclick="printReport('students')"><span class="ic">👥</span>Students</button>
    </div>
  </div>

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
