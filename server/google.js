/* =====================================================
   google.js — verifies Google Identity Services ID tokens
   Pure node:crypto (RS256 against Google's JWKS certs) —
   no new npm dependencies.

   A token is trusted only when ALL of these hold:
   - RSA-SHA256 signature matches Google's certificate (by kid)
   - aud === our GOOGLE_CLIENT_ID
   - iss === accounts.google.com
   - exp is in the future
   - email is present and verified
===================================================== */
const crypto = require('crypto');
const config = require('./config');

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let certCache = { byKid: {}, expires: 0 };

async function fetchCerts() {
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error('Could not reach Google (certs HTTP ' + res.status + ')');
  const data = await res.json();
  const byKid = {};
  for (const kid of Object.keys(data)) {
    byKid[kid] = '-----BEGIN CERTIFICATE-----\n' + data[kid] + '\n-----END CERTIFICATE-----';
  }
  if (!Object.keys(byKid).length) throw new Error('Google returned no signing keys');
  certCache = { byKid, expires: Date.now() + 60 * 60 * 1000 }; /* refresh hourly */
}

function b64urlJson(s) {
  return JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
}

/* Returns { sub, email, name, picture } or throws with a safe message. */
async function verifyIdToken(idToken) {
  const clientId = config.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured');
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = b64urlJson(parts[0]);
  const payload = b64urlJson(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('unexpected token format');

  if (certCache.expires < Date.now()) await fetchCerts();
  let pem = certCache.byKid[header.kid];
  if (!pem) { await fetchCerts(); pem = certCache.byKid[header.kid]; } /* key rotated */
  if (!pem) throw new Error('unknown signing key');

  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(parts[0] + '.' + parts[1]),
    pem,
    Buffer.from(parts[2], 'base64url')
  );
  if (!ok) throw new Error('invalid signature');

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== clientId) throw new Error('wrong audience');
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    throw new Error('wrong issuer');
  }
  if (!payload.exp || payload.exp < now) throw new Error('token expired');
  if (!payload.sub || !payload.email) throw new Error('token missing account info');
  if (payload.email_verified === false) throw new Error('Google email not verified');

  return {
    sub: String(payload.sub),
    email: String(payload.email).toLowerCase(),
    name: String(payload.name || ''),
    picture: String(payload.picture || '')
  };
}

module.exports = { verifyIdToken };
