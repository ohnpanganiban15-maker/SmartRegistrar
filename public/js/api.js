/* =====================================================
   api.js — talks to the backend REST API
   * Same-origin by default (works on localhost AND LAN
     because the browser sends requests to whatever host
     loaded the page — never hard-codes "localhost").
   * For the Android APK (or any remote access) the server
     address can be set once: localStorage "apiBase",
     e.g. http://192.168.1.100:3000
===================================================== */
const Api = {
  /* default server baked into the app — APK connects here automatically */
  defaultServer: 'https://smart-registrar.onrender.com',
  get base() {
    return localStorage.getItem('apiBase') || '';
  },
  set base(url) {
    localStorage.setItem('apiBase', (url || '').replace(/\/+$/, ''));
  },

  /* true when the page needs a server address entered:
     - native APK build (Capacitor) — auto-uses the default server;
       the setup screen only appears if the server is unreachable
       or the user wants to change the address */
  needsServerAddress() {
    if (this.base) return false;
    const native = typeof window !== 'undefined' && window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform();
    if (native) {
      this.base = this.defaultServer;
      return false;
    }
    return location.protocol !== 'http:' && location.protocol !== 'https:';
  },

  token: localStorage.getItem('sr_token') || '',

  saveSession(token, user) {
    this.token = token;
    localStorage.setItem('sr_token', token);
    localStorage.setItem('sr_user', JSON.stringify(user));
  },

  clearSession() {
    this.token = '';
    localStorage.removeItem('sr_token');
    localStorage.removeItem('sr_user');
  },

  savedUser() {
    try { return JSON.parse(localStorage.getItem('sr_user') || 'null'); } catch (e) { return null; }
  },

  isNative() {
    return typeof window !== 'undefined' && window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform();
  },

  /* raw fetch with self-healing:
     - wrong/stale saved address (old installs) → auto-switch to the official server
     - server waking up / cold start → short wait + retry (GET only) */
  async _raw(path, opts, attempt) {
    attempt = attempt || 0;
    let res;
    try {
      res = await fetch(this.base + path, opts);
    } catch (e) {
      if (this.isNative() && this.base && this.base !== this.defaultServer) {
        this.base = this.defaultServer; /* stale address (e.g. old LAN IP) → official server */
        return this._raw(path, opts, attempt + 1);
      }
      if ((opts.method || 'GET') === 'GET' && attempt < 1) {
        await new Promise(r => setTimeout(r, 3000)); /* cold start — give it a moment */
        return this._raw(path, opts, attempt + 1);
      }
      const err = new Error('Cannot reach the server. Check your internet connection and try again.');
      err.offline = true;
      throw err;
    }
    if ((res.status === 502 || res.status === 503) && attempt < 1) {
      await new Promise(r => setTimeout(r, 3000)); /* server still waking up */
      return this._raw(path, opts, attempt + 1);
    }
    return res;
  },

  async call(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    let res;
    try {
      res = await this._raw(path, {
        method, headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (e) {
      if (e.offline) throw e;
      const err = new Error('Cannot reach the server. Check your internet connection and try again.');
      err.offline = true;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && this.token) {
      this.clearSession();
      if (typeof go === 'function') go('login');
      throw new Error('Session expired, please log in again');
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Request failed (' + res.status + ')');
      err.status = res.status;
      throw err;
    }
    return data;
  },

  get(path) { return this.call('GET', path); },
  post(path, body) { return this.call('POST', path, body); },
  put(path, body) { return this.call('PUT', path, body); },
  del(path) { return this.call('DELETE', path); },

  /* raw fetch for file downloads (CSV export / backup) — returns the Response */
  async download(path, method) {
    const headers = {};
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    let res;
    try {
      res = await this._raw(path, { method: method || 'GET', headers });
    } catch (e) {
      if (e.offline) throw e;
      const err = new Error('Cannot reach the server. Check your internet connection and try again.');
      err.offline = true;
      throw err;
    }
    if (res.status === 401 && this.token) {
      this.clearSession();
      if (typeof go === 'function') go('login');
      const err = new Error('Session expired, please log in again');
      err.status = 401;
      throw err;
    }
    if (!res.ok) {
      let msg = 'Download failed (' + res.status + ')';
      try {
        const j = await res.clone().json();
        if (j && j.error) msg = j.error;
      } catch (e) {}
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return res;
  },

  /* test the configured server address — retries once (server may be waking) */
  async ping() {
    for (let i = 0; i < 2; i++) {
      try {
        const res = await fetch(this.base + '/api/auth/me');
        if (res.ok || res.status === 401) return true;
      } catch (e) {}
      if (i === 0) await new Promise(r => setTimeout(r, 3000));
    }
    return false;
  }
};
