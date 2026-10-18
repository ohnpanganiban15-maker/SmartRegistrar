/* test-db.js — shared test helper: purges student-side sample/fixture
   data so tests always run against (and leave behind) an
   example-free database. Admin, slots, document types, announcements
   and activity logs are kept. Run from the project root. */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

function purge() {
  const file = path.isAbsolute(process.env.DB_PATH || '')
    ? process.env.DB_PATH
    : path.join(__dirname, process.env.DB_PATH || 'database/smart-registrar.db');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(
    'DELETE FROM notifications;' +
    'DELETE FROM messages;' +
    'DELETE FROM document_requests;' +
    'DELETE FROM appointments;' +
    "DELETE FROM users WHERE role='student';" +
    'DELETE FROM students;'
  );
  db.close();
}

module.exports = { purge };
