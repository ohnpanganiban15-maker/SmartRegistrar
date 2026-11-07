/* =====================================================
   mailer.js — sends OTP codes and status emails.
   Two delivery providers, picked automatically:

   1. Brevo HTTP API (recommended for Render Free)
      BREVO_API_KEY=your-brevo-api-key
      MAIL_FROM=you@gmail.com        (verified sender in Brevo)
      MAIL_FROM_NAME=Smart Registrar  (optional)
      Uses HTTPS (port 443), so it works even though
      Render Free blocks SMTP ports 25/465/587.

   2. Gmail SMTP (works on localhost / paid hosts)
      GMAIL_USER=you@gmail.com
      GMAIL_APP_PASSWORD=16-char app password
      (App Password: myaccount.google.com > Security >
       2-Step Verification > App passwords)

   If neither is configured, emails are logged to the
   server console instead (dev mode).
===================================================== */
const nodemailer = require('nodemailer');

const user = (process.env.GMAIL_USER || '').trim();
const pass = (process.env.GMAIL_APP_PASSWORD || '').trim();
const brevoKey = (process.env.BREVO_API_KEY || '').trim();
const mailFrom = (process.env.MAIL_FROM || user || '').trim();
const fromName = (process.env.MAIL_FROM_NAME || 'Smart Registrar').trim();

/* Brevo needs both the API key and a verified sender address.
   If only one is present we fall back to Gmail SMTP. */
const brevoConfigured = !!(brevoKey && mailFrom);
const smtpConfigured = !!(user && pass);
const provider = brevoConfigured ? 'brevo' : (smtpConfigured ? 'smtp' : 'dev');
const configured = provider !== 'dev';

let transporter = null;
if (provider === 'smtp') {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
}

/* ---- delivery -------------------------------------------------- */

async function sendViaBrevo(to, subject, text) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': brevoKey,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { name: fromName, email: mailFrom },
      to: [{ email: to }],
      subject,
      textContent: text
    }),
    signal: AbortSignal.timeout(15000)
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error('Brevo HTTP ' + res.status + ': ' + raw.slice(0, 200));
  }
  let messageId = '';
  try { messageId = (JSON.parse(raw) || {}).messageId || ''; } catch (e) { /* non-JSON success */ }
  return { sent: true, provider: 'brevo', messageId };
}

function dispatch(to, subject, text) {
  if (provider === 'brevo') return sendViaBrevo(to, subject, text);
  return transporter.sendMail({
    from: '"' + fromName + '" <' + user + '>',
    to, subject, text
  }).then(info => ({ sent: true, provider: 'smtp', messageId: info.messageId }));
}

/* ---- public API ------------------------------------------------ */

function sendOtpMail(to, code, purpose) {
  const subject = purpose === 'change_password'
    ? 'Smart Registrar — Password Change OTP'
    : 'Smart Registrar — Account Verification OTP';
  const text = [
    'Your One-Time Password (OTP):',
    '',
    '   ' + code,
    '',
    purpose === 'change_password'
      ? 'Use this to confirm your new password. It expires in 10 minutes.'
      : 'Use this to finish creating your account. It expires in 10 minutes.',
    '',
    'If you did not request this, ignore this email.',
    '',
    '— Smart Registrar (CDLSHS)'
  ].join('\n');

  if (provider === 'dev') {
    console.log('[mailer:dev] OTP para sa ' + to + ' = ' + code + ' (' + purpose + ')');
    return Promise.resolve({ dev: true, code });
  }

  return dispatch(to, subject, text)
    .catch(err => {
      console.error('[mailer] send failed:', err.message);
      throw new Error('Hindi maipadala ang OTP email. Subukan muli mamaya.');
    });
}

/* ---------------------------------------------------------------
   Status / progress emails (request updates, pickup schedules).
   Fire-and-forget: a mail failure must never break the API call,
   so every send resolves instead of throwing.
   --------------------------------------------------------------- */
function sendStatusMail(to, subject, bodyLines) {
  if (!to) return Promise.resolve({ skipped: true });
  const text = []
    .concat(bodyLines || [])
    .concat(['', '— Smart Registrar (CDLSHS)'])
    .join('\n');

  if (provider === 'dev') {
    console.log('[mailer:dev] status email para sa ' + to + ' :: ' + subject);
    return Promise.resolve({ dev: true });
  }

  return dispatch(to, subject, text)
    .catch(err => {
      console.error('[mailer] status send failed:', err.message);
      return { sent: false, provider, error: err.message };
    });
}

module.exports = {
  sendOtpMail,
  sendStatusMail,
  isConfigured: () => configured,
  provider: () => provider,
  settings: () => ({
    provider,
    from: mailFrom ? mailFrom.replace(/^(.).*(@.*)$/, '$1***$2') : '',
    brevo: brevoConfigured,
    smtp: smtpConfigured
  })
};
