/* =====================================================
   mailer.js — sends OTP codes via Gmail SMTP.
   Requires in .env:
     GMAIL_USER=you@gmail.com
     GMAIL_APP_PASSWORD=16-char app password
   (App Password: myaccount.google.com > Security >
    2-Step Verification > App passwords)
   If not configured, OTP codes are logged to the
   server console instead (dev mode).
===================================================== */
const nodemailer = require('nodemailer');

const user = process.env.GMAIL_USER || '';
const pass = process.env.GMAIL_APP_PASSWORD || '';
const configured = !!(user && pass);

let transporter = null;
if (configured) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
}

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

  if (!transporter) {
    console.log('[mailer:dev] OTP para sa ' + to + ' = ' + code + ' (' + purpose + ')');
    return Promise.resolve({ dev: true, code });
  }

  return transporter.sendMail({
    from: '"Smart Registrar" <' + user + '>',
    to, subject, text
  }).then(info => ({ sent: true, messageId: info.messageId }))
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

  if (!transporter) {
    console.log('[mailer:dev] status email para sa ' + to + ' :: ' + subject);
    return Promise.resolve({ dev: true });
  }

  return transporter.sendMail({
    from: '"Smart Registrar" <' + user + '>',
    to, subject, text
  }).then(info => ({ sent: true, messageId: info.messageId }))
    .catch(err => {
      console.error('[mailer] status send failed:', err.message);
      return { sent: false, error: err.message };
    });
}

module.exports = {
  sendOtpMail,
  sendStatusMail,
  isConfigured: () => configured
};
