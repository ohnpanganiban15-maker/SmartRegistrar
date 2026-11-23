# Smart Registrar — Demo & Defense Script (English)

> CDLSHS Smart Registrar · Appointment & Document Request System
> Live: https://smart-registrar.onrender.com
> APK: `downloads/SmartRegistrar.apk` (also copied to `C:\Users\Admin\Downloads\SmartRegistrar.apk`)

---

## 0. Quick cheat sheet (memorize these)

| Item | Value |
|---|---|
| Admin login | `admin@cdlshs.edu.ph` / `registrar123` |
| Student login | `demo.student@cdlshs.edu.ph` / `demo1234` (students are capped at 8 characters) |
| Document request statuses | Pending → Under Review → Processing → Ready for Pickup → Completed |
| Rejection | **None** for document requests. Only appointments have Rejected/Cancelled. |
| QR scan | Starts the **24-hour claim window**; after it expires, the request auto-completes |
| QR reuse | **Single-use** — once the request is Completed, its QR can no longer be shown or scanned |
| Completed timestamp | Time of the QR scan (or the time manual completion was pressed) |
| Slots | The registrar decides **how many**; the time range is split evenly; **1 student per slot** |
| Registration fields | LRN, Email, Name, Grade, Strand, **School Year Last Attended**, Contact, Password |
| Tests | **573 automated checks** (22 persistence + 293 API + 258 frontend) |
| Stack | HTML/CSS/JS + Node.js/Express + SQLite + JWT/bcrypt + Capacitor Android + Render |

---

## 1. Before the defense (checklist)

Do this **30–60 minutes before**:

- [ ] Open https://smart-registrar.onrender.com on the laptop and phone to **wake the Render free instance** (first load can take 30–60s).
- [ ] Install the latest APK on the phone. Test: login, open Requests, open QR.
- [ ] Charge the phone and laptop. Prepare a hotspot backup.
- [ ] Prepare **two views**: laptop = admin, phone = student.
- [ ] Pre-create demo data (do not rely on live OTP during the defense):
  - [ ] Student account `demo.student@cdlshs.edu.ph` / `demo1234`
  - [ ] One **Pending** request (for the status demo)
  - [ ] One **Ready for Pickup** request with a pickup date/time (for the QR demo)
  - [ ] One **Pending appointment** (for the approve/queue demo)
- [ ] Backup: screenshots or a 2–3 minute screen recording of the full flow, in case the internet fails.
- [ ] Close unnecessary tabs/apps. Turn off pop-up notifications.
- [ ] Set the phone to **Do Not Disturb** so the demo is not interrupted.
- [ ] Do not delete any student or request during the demo.

> **Important:** do not demo live registration if the email OTP is required and the internet is weak. Show the registration form and say, “The demo account is pre-registered so we do not have to wait for an OTP.”

---

## 2. Demo accounts & data

### Admin (laptop)
- Email: `admin@cdlshs.edu.ph`
- Password: `registrar123`

### Student (phone)
- Email: `demo.student@cdlshs.edu.ph`
- Password: `demo1234`

### Suggested demo data
| Data | Purpose |
|---|---|
| Pending document request | Status dropdown demo |
| Ready for Pickup request + pickup schedule | QR scan + claim window demo |
| Pending appointment | Approve + Digital Queue demo |
| 2–3 document types | Requirements manager demo |

---

## 3. Opening script (2 minutes)

**Speaker line:**

> “Good morning/afternoon, panel. Our project is the **Smart Registrar** — an appointment and document request system for CDLSHS.
>
> In the current process, students line up, repeatedly ask whether their document is ready, and the registrar manually tracks every request. Students often miss updates as well.
>
> Smart Registrar has a **web version and an Android APK**. It includes:
> - online student registration,
> - appointment booking and a digital queue,
> - document requests with clear statuses,
> - QR-based claiming with a 24-hour window,
> - notifications and email updates,
> - and a registrar dashboard with reports, analytics, and activity logs.
>
> Our goal is to **reduce queues, make the status transparent, and make every request traceable** — for both the student and the registrar.”

---

## 4. Live demo (15 minutes)

### 4.1 Student registration and profile (2 min)

**Phone / student side**

1. Open the APK (or the live site on the phone).
2. Tap **Register**.
3. Show the fields:
   - LRN
   - Email
   - First / Last / Middle Name
   - Grade / Level
   - Strand
   - **School Year Last Attended** (e.g., `2024-2025`)
   - Contact Number
   - Password
4. **Say:**
   > “Every student has their own account. LRN and School Year Last Attended are required so the record is accurate and we have a baseline for when the student last attended.”
5. Show the **Profile**: LRN, grade, strand, **SY Last Attended**, contact, and profile photo.
6. **Say:**
   > “The registrar can also see this in Student Records, together with the latest request.”

> If the account is pre-registered, say: “This account is pre-registered so we do not have to wait for an OTP during the demo.”

---

### 4.2 Appointment booking and digital queue (3 min)

**Phone / student side**

1. Go to **Schedule**.
2. Choose a service (e.g., Certificate of Enrollment).
3. Choose a **date** and an **open slot**.
4. Enter the purpose.
5. Tap **Book appointment**.
6. Show the confirmation and reference (`APT-000X`).

**Laptop / admin side**

7. Go to **Appointments**.
8. Show the new booking and the **Queue** column.
9. Tap **Approve** (or **Approve all pending**).
10. Go to **Digital Queue**.
11. Show the **NOW SERVING** panel.
12. Tap **Call** → the student’s name appears.
13. Tap **Served** → the appointment is completed.

**Say:**
> “No more paper queue. The registrar calls the student, and everyone can see in real time who is being served.”

---

### 4.3 Document request + status + pickup schedule + expected release (4 min)

**Phone / student side**

1. Go to **Requests** → **+ New Request**.
2. Choose a document type (e.g., **SF9 / Report Card**).
3. Show the **requirements panel**:
   - “What you need”
   - “Processing: 1 day(s)”
   - Including **“No disciplinary case on record”**
4. Enter the quantity and purpose.
5. Tap **Submit request**.
6. Show the new request as **Pending**.

**Laptop / admin side**

7. Go to **Requests**.
8. Find the new request.
9. Show the **status dropdown** — one clear control instead of four buttons.
10. Set it to **Under Review**.
11. Set it to **Processing**.
12. Set it to **Ready for Pickup** → the **pickup scheduler** opens.
13. Choose the **pickup date** and **pickup time** → **Save schedule**.
14. Show the **Expected Release** column → tap **+ Set** → choose a date → **Save date**.
15. **Say:**
    > “The registrar controls the status and schedule. The Expected Release Date is set manually by the registrar and is visible to the student. We do not use ‘Rejected’ for document requests — Under Review is the correct step when something needs verification.”

**Phone / student side**

16. Refresh **Requests**.
17. Show:
    - the new status,
    - the pickup date/time,
    - the **Expected release** date,
    - the notification.

18. **Say:**
    > “The student can see exactly where the request is, when to claim it, and when it is expected to be released.”

---

### 4.4 QR scan and the 24-hour claim window (2 min)

**Laptop / admin side**

1. Go to **QR Scanner**.
2. Scan the request QR (or type the reference).
3. Show the verdict and the **24-hour claim window**.
4. **Say:**
    > “Scanning the QR starts the 24-hour claim window. When it expires, the request automatically becomes Completed. The completed timestamp is the scan time — not the sweep time — so the record stays accurate.”

**Laptop / admin side — prove the QR is single-use**

5. Complete the request (manually or let the window expire).
6. Open **Requests** again and point to the row: the QR button is now disabled and reads **QR used**.
7. Scan the same QR again or type the reference in **QR Scanner** → the verdict is **USED** and the scan is refused.
8. **Say:**
    > “Once the request is Completed, the QR is single-use and can no longer be reused. The scanner shows USED, and the claim API returns a conflict. This prevents the same document from being claimed twice.”

**Phone / student side**

9. Open **My QR** and show the student QR (active transactions only).
10. Open **Requests** → the completed request shows **QR already used** instead of a QR button.
11. **Say:**
    > “The QR is the student’s identity and transaction reference. It becomes unusable once the request is completed, and the registrar can still complete a request manually if needed.”

---

### 4.5 Student Records + Document Requirements (2 min)

**Laptop / admin side**

1. Go to **Students**.
2. Show the columns:
   - LRN
   - Name
   - Grade
   - Strand
   - **SY Last Attended**
   - Contact
   - **Document Requested**
   - **Request Status**
   - **Request Date**
3. **Say:**
   > “At a glance, the registrar can see the student’s latest request — no need to jump to another page.”

4. Go to **Requirements**.
5. Show the types:
   - **SF9 / Report Card**
   - **Other Certifications**
   - **No Disciplinary Case**
6. Tap **Edit** on a type.
7. Show that the registrar can change:
   - name
   - description
   - requirements (one per line)
   - processing days
   - active/disabled
8. **Say:**
   > “We do not delete document types — we disable them so the history of old requests stays intact. The registrar can edit the requirements.”

---

### 4.6 Chat and notifications (1 min)

**Phone / student side**

1. Go to **Customer Service**.
2. Send an inquiry (e.g., “When will my SF9 be ready?”).

**Laptop / admin side**

3. Go to **Customer Service**.
4. Show the inquiry and reply.
5. **Say:**
   > “Students and the registrar can chat directly. The student also gets a notification and email when the registrar replies or when the status changes.”

**Phone / student side**

6. Show **Alerts** and the new notification.

---

### 4.7 Reports, analytics, and activity logs (1 min)

**Laptop / admin side**

1. Go to **Reports** → show printable requests/appointments/summary.
2. Go to **Analytics** → show completion rate, top documents, students by grade, feedback.
3. Go to **Activity Logs** → show search, action filter, and date range.
4. **Say:**
   > “Every action has an audit trail. The registrar can see who changed a status, when, and for which request.”

---

## 5. Speed run (7 minutes)

If time is short, show only these:

1. **Student:** login → Requests → new request → status.
2. **Admin:** Requests → status dropdown → Ready for Pickup + schedule → Expected Release.
3. **Student:** notification + pickup + expected release.
4. **Admin:** QR Scanner → 24-hour window.
5. **Admin:** Students (request summary) + Requirements (Edit).
6. **Admin:** Analytics/Reports (one slide only).
7. **Closing.**

---

## 6. Optional technical walkthrough (3 minutes)

**Say while showing the repository:**

> “The frontend uses HTML, CSS, and vanilla JavaScript. The backend is Node.js and Express. The database is SQLite using `node:sqlite`. Authentication uses JWT and bcrypt. The Android app is built with Capacitor, so the web and APK share one codebase.”

Show:

- `server/index.js` — app entry and routes
- `server/db.js` — schema, migrations, backfill
- `server/routes/` — auth, students, requests, appointments, slots, chat, misc
- `server/persistence.js` — cloud snapshot restore
- `public/js/views/` — student and admin views
- `test-api.js`, `test-frontend.js`, `test-persistence.js` — automated tests

**Say:**
> “We have 573 automated checks: persistence, API, and frontend. Every new feature comes with regression tests.”

---

## 7. Closing script (1 minute)

> “Overall, Smart Registrar is more than a digitized form. It is:
> - **transparent** — five clear statuses and an expected release date;
> - **traceable** — QR, activity logs, and completed timestamps;
> - **efficient** — appointment slots, a digital queue, and pickup scheduling;
> - **accessible** — web and Android APK;
> - and **measurable** — reports and analytics for the registrar’s decisions.
>
> In the next phase, we plan to add **push notifications and quick reply** so that even when the student is in another app, they still receive updates and can reply to the registrar from the notification.
>
> Thank you, panel. We are ready for your questions.”

---

## 8. Defense Q&A (with suggested answers)

### A. Policy and process

**Q: Why is there no “Rejected” or “Cancelled” for document requests?**
> “That is a deliberate policy. A document request should not be rejected without an explanation. When something is missing or needs verification, the status is **Under Review**. Only appointments have Rejected/Cancelled because they have a schedule that can be cancelled. We kept the old rows in the database for historical integrity, but the API and UI no longer use them.”

**Q: What if the registrar sets the wrong status?**
> “They can move it back to Processing or Under Review using the same dropdown. Every change is recorded in the activity log. Only the pickup schedule is locked once Completed, so the historical record cannot be altered.”

**Q: Why is the Expected Release Date manual instead of auto-computed?**
> “Manual is more realistic for a school: there are holidays, backlogs, and special cases. The registrar has the real knowledge of when a document can be released. Each document type still has processing days as a guide. The date can also be cleared if it is not yet certain.”

**Q: Why are document types not deleted?**
> “To preserve history. If an old request used that type, the record must remain. We only **disable** types, and they disappear from the student side.”

**Q: Why is “No disciplinary case on record” part of the requirements?**
> “It is a standard school clearance. We added it to every type’s requirement list so students know before requesting. The migration is idempotent, so it is not duplicated even after a snapshot restore.”

### B. Technical

**Q: What is the tech stack?**
> “HTML, CSS, and vanilla JavaScript for the frontend. Node.js and Express for the backend. SQLite for the database. JWT and bcrypt for authentication. Capacitor for the Android APK. Hosted on Render, with snapshot backup to cloud storage.”

**Q: Why SQLite?**
> “This is a single-school load, so SQLite is sufficient and fast. It is zero-config and easy to back up. If the deployment grows, we can migrate to PostgreSQL without changing the business logic.”

**Q: How does data persist on Render when the disk is ephemeral?**
> “The persistence layer takes snapshots and restores them from cloud storage. Migrations and backfills also run after a restore, so even an old snapshot gets the new columns and corrected completed timestamps.”

**Q: How are accounts secured?**
> “Bcrypt password hashing, JWT sessions, role-based access for students and admins, a lockout after 5 failed logins, OTP rate limiting, input validation, and parameterized SQL queries to prevent SQL injection.”

**Q: How do you prevent duplicate bookings and requests?**
> “Database constraints and server-side checks. For slots, creation is all-or-nothing with a duplicate check. For appointments, one booking per slot. For requests, there is a reference number and validation.”

**Q: How is the completed timestamp accurate?**
> “There are two sources: when the QR is scanned, `claimed_at` is used; when the registrar presses Completed manually, the server time is used. The sweep time is never used, so the record is correct even though the auto-complete job runs every minute.”

**Q: How does the QR work?**
> “The QR contains the reference. The scanner verifies with the server whether it is valid, inside the claim window, or already used. The first scan starts the 24-hour window. Re-scanning does not restart the clock. Once the request is Completed, the QR is single-use: the lookup returns USED, the claim endpoint returns 409, and the UI hides the QR button — so the same QR cannot be used twice.”

**Q: What automated tests do you have?**
> “573 checks: 22 persistence, 293 API, and 258 frontend. They cover auth, roles, statuses, pickup, QR, slots, chat, reports, migrations, and UI flows.”

**Q: Why Capacitor instead of native?**
> “One codebase for web and Android. It is faster to maintain and deploy. The APK provides an app icon and install experience, while the web version serves the laptop/registrar.”

### C. Usability and impact

**Q: How does it reduce queues?**
> “Appointment slots and a digital queue. The registrar calls the student, so no one has to stand in line. There is also a pickup schedule for document claiming.”

**Q: How does the student learn about updates?**
> “In-app notifications, the status on the Requests page, and email via Brevo for status changes and pickup schedules. The next phase adds push notifications and quick reply.”

**Q: What if there is no internet?**
> “The system is online-first. The APK opens the app, but a connection is needed for live data. We plan to add offline caching and sync in the future.”

**Q: How do you handle data privacy?**
> “We collect minimal data. Access is role-based. The public QR lookup does not expose sensitive fields. Activity logs provide accountability. The next step is a formal privacy impact assessment and consent notice.”

### D. Limitations and future work

**Q: What are the limitations?**
> “It needs internet. There is no push notification/quick reply yet. There is no payment or SMS. It is designed for a single school. The expected release date is manual. SQLite is used for the current load.”

**Q: What is the future work?**
> “FCM push notifications with quick reply, offline mode, SMS reminders, online payment, multi-school support, deeper analytics, and automated backup/restore monitoring.”

**Q: Why is there no online payment?**
> “It is out of scope for now. The focus is appointments, request tracking, and claiming. It can be added in a later phase once the school has a payment gateway.”

---

## 9. If something goes wrong

| Problem | What to do |
|---|---|
| Render is slow / sleeping | Say: “The free instance is just waking up.” Show the backup screenshot/video. |
| Internet fails | Switch to the phone hotspot. If it still fails, use the screen recording. |
| OTP email is delayed | Do not register live. Log in to the pre-created demo account. |
| Wrong data / accidental delete | Do not panic. Refresh. Use a backup account if needed. |
| Scanner camera fails | Type the reference into the manual input. |
| Wrong status was clicked | Set it back using the dropdown; the activity log records it. |
| Panel asks about a feature that is not done | Be honest: “That is not in scope yet; it is in future work.” |

---

## 10. Limitations & future work (slide-ready)

**Limitations**
- Online-first; needs internet.
- No push notification / quick reply yet.
- No SMS or online payment.
- Single-school deployment.
- Manual expected release date.
- SQLite for the current load.

**Future work**
- FCM push + Android quick reply.
- Offline mode and background sync.
- SMS reminders.
- Payment integration.
- Multi-school / PostgreSQL.
- Privacy impact assessment and consent management.

---

## 11. One-liners to memorize

- “**Five statuses, no rejection** — Under Review is the answer when something is unclear.”
- “**QR scan starts the 24-hour claim window; completed time = scan time.**”
- “**The request QR is single-use** — once Completed, it shows USED and cannot be scanned again.”
- “**The registrar decides how many slots**; the range is split evenly; one student per slot.”
- “**The expected release date is manual** because the registrar knows the real constraints.”
- “**Student Records shows the latest request** — document, status, and date — in one row.”
- “**Types are disabled, never deleted**, so history stays intact.”
- “**573 automated checks** — persistence, API, and frontend.”
- “**Web and APK, one codebase** — via Capacitor.”

---

## 12. Sample panel questions about the latest changes

**Q: Why add School Year Last Attended to registration?**
> “It gives the registrar a baseline for when the student last attended. It helps with record verification and locating the correct file. It is required in the form but lenient on the server for older clients.”

**Q: Why show the request status and date in Student Records?**
> “So the registrar sees everything at a glance. Previously, they had to go to the Requests page. Now the latest document, status, and request date are in the student row.”

**Q: Why is there an Edit option in Document Requirements?**
> “School requirements change. They cannot be hard-coded. The registrar controls the description, requirements, processing days, and active status.”

**Q: How do you ensure the expected release date is correct?**
> “It is manual and server-validated. Only valid calendar dates are accepted. The student gets a notification and email when it is set or cleared. It is visible on both the admin and student sides.”

---

*End of script. Good luck with the defense!*
