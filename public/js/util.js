/* =====================================================
   util.js — shared helpers: escaping, formatting,
   toast messages, modal dialogs, status badges
===================================================== */

/* escape text for safe HTML insertion */
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* 2026-10-04 → October 4, 2026 (Sunday) */
function fmtDate(iso) {
  if (!iso) return '—';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function daysFromNowISO(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
/* "08:00" → "8:00 AM" */
function fmtTime(t) {
  if (!t) return '—';
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  let h = parseInt(m[1], 10);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return h + ':' + m[2] + ' ' + ap;
}
function timeRange(start, end) { return fmtTime(start) + ' – ' + fmtTime(end); }
function initials(name) {
  return String(name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

/* strong-password rules — shared with the server (server/routes/auth.js) */
function passwordIssue(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain both letters and numbers.';
  const low = pw.toLowerCase();
  const common = ['12345678', '123456789', '1234567890', 'password', 'password1', 'password123',
    'qwerty123', 'qwertyuiop', 'abc123456', 'abcd1234', 'iloveyou', 'admin123', 'letmein',
    'welcome1', 'welcome123', 'monkey123', 'football', 'baseball', 'princess', 'sunshine',
    'master123', 'dragon123', 'trustno1', 'starwars', 'passw0rd', 'p@ssw0rd', '00000000',
    '11111111', 'aaaaaaaa', '1q2w3e4r', 'zaq12wsx', 'asdfghjkl', 'qazwsxedc'];
  if (common.indexOf(low) !== -1) return 'That password is too common — choose a stronger one.';
  if (/^(?:0123456789|1234567890|abcdefghij|abcdefgh|qwertyuiop)/.test(low)) return 'Avoid simple sequences like 12345678 — choose a stronger one.';
  if (/^(.)\1+$/.test(pw)) return 'Avoid repeating the same character — choose a stronger one.';
  return '';
}

/* status → css class (lowercased, spaces→dash) */
function statusClass(s) {
  return 'st-' + String(s || '').toLowerCase().replace(/\s+/g, '-');
}
/* status stamp badge */
function stamp(s) {
  return '<span class="stamp ' + statusClass(s) + '">' + esc(s) + '</span>';
}

/* ---- toast messages ---- */
function toast(msg, kind) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || 'success');
  el.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3200);
}

/* ---- modal dialog (forms, confirmations, QR viewer) ---- */
function openModal(html, opts) {
  const root = document.getElementById('modal-root');
  root.innerHTML =
    '<div class="modal-backdrop" onclick="if(event.target===this)closeModal()">' +
      '<div class="modal ' + ((opts && opts.size) || '') + '" role="dialog" aria-modal="true">' + html + '</div>' +
    '</div>';
  document.body.classList.add('has-modal');
}
function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
  document.body.classList.remove('has-modal');
  if (window._scannerTimer) { clearInterval(window._scannerTimer); window._scannerTimer = null; }
  if (window._scannerStream) {
    window._scannerStream.getTracks().forEach(t => t.stop());
    window._scannerStream = null;
  }
}
/* confirmation dialog — returns a Promise<boolean> */
function confirmDlg(message, okLabel) {
  return new Promise(resolve => {
    window.__confirmResult = resolve;
    openModal(
      '<div class="modal-head"><div class="modal-title">Please confirm</div></div>' +
      '<div class="modal-body"><p>' + esc(message) + '</p></div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-outline" onclick="__confirmResult(false);closeModal()">Cancel</button>' +
        '<button class="btn btn-danger" onclick="__confirmResult(true);closeModal()">' + esc(okLabel || 'Yes, continue') + '</button>' +
      '</div>'
    );
    /* backdrop close counts as cancel */
    const origClose = window.closeModal;
    window.closeModal = function () { window.__confirmResult = null; origClose(); window.closeModal = origClose; resolve(false); };
  });
}

/* simple loading placeholder for async views */
function loadingHTML(label) {
  return '<div class="loading"><div class="spinner"></div><div>' + esc(label || 'Loading…') + '</div></div>';
}

/* error box used inside views */
function errorBox(msg) {
  return '<div class="error-box">' + esc(msg) + '</div>';
}

/* group appointments/requests/slots by date (returns [date, items[]], sorted) */
function groupByDate(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.date)) map.set(r.date, []);
    map.get(r.date).push(r);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/* horizontal bar chart (pure CSS, offline) — rows: {label, value, color?} */
function barChart(rows, colorVar) {
  const max = Math.max(1, ...rows.map(r => Number(r.value) || 0));
  return '<div class="bar-chart">' + rows.map(r =>
    '<div class="bar-row">' +
      '<div class="bar-label">' + esc(r.label) + '</div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + Math.round((Number(r.value) || 0) / max * 100) + '%;background:' + (r.color || colorVar || 'var(--primary)') + '"></div></div>' +
      '<div class="bar-value">' + (Number(r.value) || 0) + '</div>' +
    '</div>').join('') + '</div>';
}
