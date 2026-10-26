/* =====================================================
   chat.js — Messenger-like chat per document request
   Floating chat head · popup window · live polling ·
   auto-popup for students when the registrar replies.
===================================================== */

const Chat = {
  requestId: null,
  meta: null,
  isOpen: false,
  unread: 0,
  latestReq: null,

  /* ---------- DOM ---------- */
  ensure() {
    if (this._root) return this._root;
    const root = document.createElement('div');
    root.id = 'chat-root';
    root.innerHTML = `
      <div class="chat-head" id="chat-head" onclick="Chat.onHead()" title="Messages" role="button" aria-label="Messages">
        <span class="chat-head-ic">💬</span>
        <span class="chat-badge" id="chat-badge" hidden>0</span>
      </div>
      <div class="chat-win" id="chat-win" hidden>
        <div class="chat-top">
          <div class="chat-peer">
            <div class="chat-avatar" id="chat-avatar">SR</div>
            <div class="chat-peer-txt">
              <b id="chat-name">Registrar</b>
              <div class="chat-sub mono" id="chat-sub"></div>
            </div>
          </div>
          <button class="chat-x" onclick="Chat.close()" title="Close chat">✕</button>
        </div>
        <div class="chat-body" id="chat-body"></div>
        <div class="chat-typing" id="chat-typing" hidden>
          <span class="chat-dots"><i></i><i></i><i></i></span>
          <span class="chat-typing-txt" id="chat-typing-txt">typing…</span>
        </div>
        <div class="chat-form">
          <input class="input" id="chat-text" placeholder="Type a message…" autocomplete="off"
            onkeydown="if(event.key==='Enter'){event.preventDefault();Chat.send();}"
            onkeyup="Chat.typing()">
          <button class="btn btn-primary btn-sm" onclick="Chat.send()">Send</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    this._root = root;
    return root;
  },

  /* ---------- open / close ---------- */
  async openThread(requestId) {
    this.ensure();
    try {
      const data = await Api.get('/api/messages/' + requestId);
      this.requestId = requestId;
      this.meta = data.request;
      this.isOpen = true;
      const isAdmin = !!(state.me && state.me.role === 'admin');
      document.getElementById('chat-win').hidden = false;
      document.getElementById('chat-head').classList.add('active');
      document.getElementById('chat-name').textContent =
        isAdmin ? data.request.student_name : 'Registrar';
      document.getElementById('chat-sub').textContent =
        data.request.ref + ' · ' + data.request.doc_type;
      document.getElementById('chat-avatar').textContent =
        initials(isAdmin ? data.request.student_name : 'SR');
      this.paint(data.messages);
      this.paintTyping(!!data.peer_typing);
      await this.markRead(requestId);
      this.unread = 0;
      this.paintBadge();
      const inp = document.getElementById('chat-text');
      if (inp) setTimeout(function () { inp.focus(); }, 60);
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  close() {
    this.isOpen = false;
    const win = document.getElementById('chat-win');
    if (win) win.hidden = true;
    const head = document.getElementById('chat-head');
    if (head) head.classList.remove('active');
  },

  reset() {
    this.close();
    this.requestId = null;
    this.meta = null;
    this.unread = 0;
    this.latestReq = null;
    this.paintBadge();
  },

  onHead() {
    if (this.latestReq) this.openThread(this.latestReq);
    else toast('No messages yet.', 'info');
  },

  /* ---------- messages ---------- */
  paint(msgs) {
    const body = document.getElementById('chat-body');
    if (!body) return;
    const mineRole = (state.me && state.me.role === 'admin') ? 'admin' : 'student';
    if (!msgs || !msgs.length) {
      body.innerHTML = '<div class="chat-empty">Wala pang mensahe dito.<br>Simulan ang usapan! 💬</div>';
      return;
    }
    /* only follow new messages if the user is already near the bottom */
    const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 150;
    body.innerHTML = msgs.map(function (m) {
      const mine = m.sender_role === mineRole;
      const t = String(m.created_at || '').slice(11, 16);
      /* read receipt on MY messages: read once the other role's flag is set */
      let tick = '';
      if (mine) {
        const otherRead = mineRole === 'student' ? m.read_admin : m.read_student;
        tick = otherRead
          ? '<span class="tick read" title="Read">✓✓</span>'
          : '<span class="tick" title="Sent">✓✓</span>';
      }
      return '<div class="chat-msg ' + (mine ? 'mine' : 'theirs') + '">' +
        '<div class="chat-bub">' + esc(m.body) + '</div>' +
        '<div class="chat-t">' + t + tick + '</div>' +
      '</div>';
    }).join('');
    if (nearBottom) body.scrollTop = body.scrollHeight;
  },

  async refresh() {
    if (!this.isOpen || !this.requestId) return;
    try {
      const data = await Api.get('/api/messages/' + this.requestId);
      this.paint(data.messages);
      this.paintTyping(!!data.peer_typing);
    } catch (e) {}
  },

  async send() {
    const inp = document.getElementById('chat-text');
    if (!inp || !this.requestId) return;
    const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    try {
      await Api.post('/api/messages/' + this.requestId, { text });
      await this.refresh();
    } catch (e) {
      inp.value = text;
      toast(e.message, 'error');
    }
  },

  async markRead(requestId) {
    try { await Api.post('/api/messages/' + requestId + '/read', {}); } catch (e) {}
  },

  /* ---------- typing heartbeat (throttled so we don't spam) ---------- */
  typing() {
    if (!this.requestId) return;
    const now = Date.now();
    if (this._lastTyping && now - this._lastTyping < 2000) return; /* max every 2s */
    this._lastTyping = now;
    try { Api.post('/api/messages/' + this.requestId + '/typing', {}); } catch (e) {}
  },

  paintTyping(show) {
    const el = document.getElementById('chat-typing');
    if (el) el.hidden = !show;
  },

  /* ---------- badge ---------- */
  paintBadge() {
    const head = document.getElementById('chat-head');
    const badge = document.getElementById('chat-badge');
    if (!head || !badge) return;
    const logged = typeof Api !== 'undefined' && !!Api.token &&
      typeof state !== 'undefined' && !!state.me;
    head.classList.toggle('visible', logged);
    if (!logged || !this.unread) {
      badge.hidden = true;
      return;
    }
    badge.hidden = false;
    badge.textContent = this.unread > 9 ? '9+' : String(this.unread);
  },

  /* ---------- polling (runs every 8s) ---------- */
  async poll() {
    try {
      if (typeof Api === 'undefined' || typeof state === 'undefined') return;
      this.paintBadge();
      if (!Api.token || !state.me) return;
      this.ensure();
      this.paintBadge();
      const r = await Api.get('/api/messages/unread-count');
      const grew = r.count > this.unread;
      this.unread = r.count;
      this.latestReq = r.latest_request_id;
      this.paintBadge();
      if (r.count > 0 && r.latest_request_id) {
        if (this.isOpen && this.requestId === r.latest_request_id) {
          await this.refresh();
          await this.markRead(r.latest_request_id);
          this.unread = 0;
          this.paintBadge();
        } else if (state.me.role === 'student' && (grew || !this.isOpen)) {
          /* messenger-style popup when the registrar sends a message */
          await this.openThread(r.latest_request_id);
        }
        /* admin: badge + notification; opens from the Requests table */
      } else if (this.isOpen) {
        await this.refresh();
      }
    } catch (e) {}
  }
};

setInterval(function () { Chat.poll(); }, 8000);
/* faster refresh while the window is open so typing + read receipts feel live */
setInterval(function () {
  if (Chat.isOpen && Chat.requestId) Chat.refresh();
}, 3000);
