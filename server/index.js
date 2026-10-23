/* =====================================================
   index.js — Smart Registrar server
   Serves the frontend and the REST API on the LAN.
   Run:  npm start        (then open http://<PC-IP>:3000)
===================================================== */
const os = require('os');
const path = require('path');
const express = require('express');
const config = require('./config');
const { seed } = require('./seed');

const app = express();
app.use(express.json({ limit: '1mb' }));

/* CORS — lets the Android APK (different origin) talk to this server */
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* basic security headers (safety hardening) */
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Download-Options', 'noopen');
  res.set('Permissions-Policy', 'camera=(self), microphone=()');
  next();
});

/* ---- API routes ---- */
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/slots', require('./routes/slots'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api', require('./routes/misc'));

/* unknown API path → JSON 404 (instead of returning index.html) */
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));

/* ---- frontend ---- */
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

/* ---- APK downloads (kept OUTSIDE public/ so it never bakes into the app) ---- */
const downloadsDir = path.join(__dirname, '..', 'downloads');
app.use('/downloads', express.static(downloadsDir));

app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

/* ---- error handler ---- */
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

/* ---- start ---- */
seed(); /* sample data only created when the DB is empty */

app.listen(config.PORT, config.HOST, () => {
  const nets = os.networkInterfaces();
  const lanIps = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) lanIps.push(net.address);
    }
  }
  console.log('');
  console.log('  ================================================');
  console.log('   CDLSHS Smart Registrar — server is running');
  console.log('  ================================================');
  console.log('   On this computer : http://localhost:' + config.PORT);
  for (const ip of lanIps) {
    console.log('   From other devices: http://' + ip + ':' + config.PORT);
  }
  if (lanIps.length === 0) {
    console.log('   (no LAN connection detected — connect to Wi-Fi first)');
  }
  console.log('   Press Ctrl+C to stop the server.');
  console.log('  ================================================');
  console.log('');
});
