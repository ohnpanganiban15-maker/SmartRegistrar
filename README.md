# Smart Registrar System for CDLSHS

**Development of a Smart Registrar Application for Appointment and Document Requests at CDLSHS**

A fully working, LAN-based registrar web application — students book appointments and request
documents online; the registrar manages everything from an admin dashboard. Works inside the
school **without internet**, and can be installed on Android as an APK that connects to the
same Wi-Fi network.

---

## Table of Contents

1. [Technologies Used](#1-technologies-used)
2. [System Architecture](#2-system-architecture)
3. [Default Accounts](#3-default-accounts)
4. [Project Structure](#4-project-structure)
5. [Installation (Windows PC)](#5-installation-windows-pc)
6. [Database Setup](#6-database-setup)
7. [Local Network (Wi-Fi / LAN) Setup](#7-local-network-wi-fi--lan-setup)
8. [Android APK Build](#8-android-apk-build)
9. [Testing Instructions](#9-testing-instructions)
10. [API Reference](#10-api-reference)
11. [Troubleshooting Guide](#11-troubleshooting-guide)

---

## 1. Technologies Used

| Layer | Technology | Why it was chosen |
|---|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript (no framework) | Easy for a Grade 12 student to read, maintain and explain |
| Styling | Custom CSS with light/dark theme variables | Professional look, works offline (system fonts, no CDN) |
| Backend | Node.js + Express | Simple REST API, runs on any Windows PC |
| Database | SQLite via Node's built-in `node:sqlite` | Zero installation, one file, perfect for local/LAN use |
| Passwords | bcryptjs (hashing) | Passwords are never stored in plain text |
| Sessions | JSON Web Tokens (JWT), 7-day expiry | Stateless login, role-based access (admin/student) |
| QR codes | qrcodejs (generation) + jsQR (scanning) | Both bundled locally — works with no internet |
| Android APK | Capacitor wrapper | Wraps the same web app into an installable APK |
| Testing | Node built-in `fetch` + jsdom | Automated API and UI tests |

**No cloud services are required.** Everything runs on the school computer.

---

## 2. System Architecture

```
                 ┌──────────────────┐
                 │  Local Wi-Fi     │
                 │     Router       │
                 └────────┬─────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
 ┌────────▼────────┐              ┌───────▼────────┐
 │ Windows Laptop  │              │ Android Phone  │
 │                 │              │                │
 │ Frontend (SPA)  │              │ APK / Browser  │
 │ Express Backend │◄────────────►│ Mobile Client  │
 │ SQLite Database │   HTTP :3000 │                │
 └─────────────────┘              └────────────────┘
```

**How a request flows (example: student books an appointment):**

1. The phone/APK opens `http://192.168.1.100:3000` — the **frontend** (HTML/CSS/JS) loads from the Express server.
2. The student logs in → the frontend sends `POST /api/auth/login` to the **backend** with the email and password.
3. The backend hashes-compares the password (bcrypt), creates a **JWT token**, and returns it.
4. Every following request carries `Authorization: Bearer <token>` — the backend checks the token and the user's **role** (admin/student) before allowing access.
5. The booking is validated **inside a database transaction**: the slot must be open and free of other active appointments → **double booking is impossible**.
6. Data is stored in the **SQLite file** (`database/smart-registrar.db`), and a **notification** is written for the student.
7. The registrar's dashboard reads the same database → sees the booking instantly.

**Security practices implemented:**

- Passwords hashed with bcrypt (never plain text)
- JWT tokens with expiry; role-based authorization middleware (`requireAuth`, `requireAdmin`)
- Input validation on every API endpoint
- Confirmation dialogs before deleting records
- QR lookups return only non-sensitive fields (no contact info, no grades of other students)
- Students can only see their own records; admin routes return 403 for students

---

## 3. Default Accounts

| Role | Email | Password | Use for |
|---|---|---|---|
| **Admin / Registrar** | `admin@cdlshs.edu.ph` | `admin123` | Admin dashboard, managing everything |
| Student | — | — | No sample students — create accounts via **"Create an account"** on the login screen (self-register) |

> ⚠️ Change the admin password in a real deployment (see Troubleshooting → "Change admin password").
> Students can also self-register from the login screen.

---

## 4. Project Structure

```
SmartRegistrar/
├── server/                    ← BACKEND
│   ├── index.js               ← starts the Express server (port 3000)
│   ├── config.js              ← reads .env settings
│   ├── db.js                  ← SQLite database + table definitions
│   ├── auth.js                ← bcrypt + JWT + role middleware
│   ├── seed.js                ← realistic sample data (runs when DB is empty)
│   └── routes/                ← REST API endpoints
│       ├── auth.js            ← login / register / me
│       ├── students.js        ← student records (admin CRUD)
│       ├── slots.js           ← appointment availability
│       ├── appointments.js    ← booking + approve/reject/reschedule
│       ├── requests.js        ← document requests
│       ├── notifications.js   ← in-app notifications
│       ├── chat.js            ← customer service messages
│       ├── announcements.js   ← announcements
│       └── misc.js            ← dashboard stats, reports, logs, QR lookup
├── public/                    ← FRONTEND
│   ├── index.html             ← app shell
│   ├── css/style.css          ← theme (light/dark), responsive layout
│   └── js/
│       ├── api.js             ← talks to the backend (configurable server URL)
│       ├── util.js            ← helpers (dates, toasts, modals, charts)
│       ├── app.js             ← router, navigation, all action handlers
│       ├── views/student.js   ← student screens
│       ├── views/admin.js     ← admin screens
│       └── vendor/            ← offline QR libraries
├── database/
│   └── smart-registrar.db     ← SQLite file (auto-created on first run)
├── .env / .env.example        ← configuration (port, secret, DB path)
├── capacitor.config.json      ← APK wrapper configuration
├── package.json               ← dependencies + npm scripts
├── test-api.js                ← automated API tests (52 checks)
└── test-frontend.js           ← automated UI tests (39 checks)
```

---

## 5. Installation (Windows PC)

### Step 1 — Install Node.js

Download and install Node.js LTS (v18 or newer) from https://nodejs.org
(Installation: click Next until finished.)

Verify in **Command Prompt** or **PowerShell**:

```text
node --version      (e.g. v24.16.0)
npm --version       (e.g. 11.13.0)
```

### Step 2 — Install project dependencies

Open PowerShell **inside the project folder** (`SmartRegistrar`) and run:

```text
npm install
```

This installs Express, bcryptjs and jsonwebtoken only — no database installation needed
(SQLite is built into Node itself).

### Step 3 — (Optional) configure

Copy `.env.example` to `.env` (already provided) and edit if needed:

```text
PORT=3000                # server port
HOST=0.0.0.0             # reachable from other devices
JWT_SECRET=change-me...  # change this to random text
DB_PATH=./database/smart-registrar.db
```

### Step 4 — Start the server

```text
npm start
```

Expected output:

```text
  ================================================
   CDLSHS Smart Registrar — server is running
  ================================================
   On this computer : http://localhost:3000
   From other devices: http://192.168.1.11:3000
   Press Ctrl+C to stop the server.
  ================================================
```

Open **http://localhost:3000** in a browser — the login screen appears.

> Leave the PowerShell window open while using the app. Closing it stops the server.
> `localhost` only works **on the computer itself** — other devices use the IP address shown.

---

## 6. Database Setup

**Nothing to install** — SQLite is built into Node.js.

- The database file `database/smart-registrar.db` is **created automatically** on first run.
- On the very first run the server **seeds sample data**: 7 users, 6 students, 42 appointment
  slots (14 weekdays), 5 appointments, 5 document requests, announcements, chat messages and
  notifications — so you can demonstrate everything immediately.

### Tables

| Table | Purpose |
|---|---|
| `users` | login accounts (email, hashed password, role, status) |
| `students` | student records (number, name, grade, strand, contact) |
| `appointment_slots` | available date/time slots (open/closed) |
| `appointments` | bookings — reference `APT-0001`, status, slot link |
| `document_types` | list of requestable documents |
| `document_requests` | requests — reference `REQ-0001`, status |
| `notifications` | per-user in-app notifications |
| `messages` | customer service inquiries + admin replies |
| `announcements` | registrar announcements |
| `activity_logs` | audit trail of important actions |

### Reset the database (fresh demo)

1. Stop the server (Ctrl+C)
2. Delete `database/smart-registrar.db`
3. Run `npm start` again — sample data is re-created automatically

Or just reset the data without stopping: `npm run seed` (only seeds an empty database).

---

## 7. Local Network (Wi-Fi / LAN) Setup

### 1. Start the server on the main computer

```text
npm start
```

Note the line `From other devices: http://192.168.1.11:3000` — this is your computer's
**local IP**. (Your IP will differ.)

### 2. Find your computer's IP address any time

```text
ipconfig
```

Look for **IPv4 Address** under your active Wi-Fi adapter, e.g. `192.168.1.100`.

### 3. Allow the app through Windows Firewall

First time you start the server, Windows may ask — click **Allow access** (choose
**Private networks**). If you missed the prompt:

1. Open **Windows Security** → **Firewall & network protection** → **Allow an app through firewall**
2. Click **Change settings** → **Allow another app…**
3. Browse to `C:\Program Files\nodejs\node.exe` → **Add** → tick **Private** → OK

### 4. Connect the phone

- Phone must join the **same Wi-Fi** as the computer (not mobile data, not a different network)
- Open the phone browser (Chrome) → go to `http://192.168.1.100:3000` (your IP + port)
- Log in — everything works exactly as on the computer

### 5. Example

```text
PC IP: 192.168.1.100
Port : 3000

Phone browser:  http://192.168.1.100:3000
```

### Rules to remember

- The frontend **never hard-codes `localhost`** — it always talks to *whatever address loaded
  the page*, so the same URL works on every device.
- `localhost` = the computer only. Other devices **must** use the LAN IP.
- If the Wi-Fi router reassigns IPs, the address may change — run `ipconfig` again.

### Online deployment (hindi na LAN)

Para sa permanentong URL kahit saan (walang Wi-Fi requirement) — VPS + domain
(~₱350–500/month all-in, permanentong data, libreng automatic HTTPS):

→ Sundin ang **[DEPLOY.md](DEPLOY.md)** — kasama ang `deploy/install.sh` (one-shot installer)
at araw-araw na auto-backup (`scripts/backup.js`).

---

## 8. Android APK Build

The APK wraps the **same web app** with [Capacitor](https://capacitorjs.com). It does **not**
contain the database — it connects to your PC over the same Wi-Fi:

```text
Android Phone → Same Wi-Fi → Local Computer Server → SQLite Database
```

### Step 1 — Install prerequisites

1. **Node.js** (already installed — see Section 5)
2. **Android Studio** — download from https://developer.android.com/studio (large download, ~1 GB)
   - During setup, accept defaults; also install the **Android SDK** and **Android Build Tools**
   - Let Android Studio finish its first-time setup (it downloads Gradle automatically)
3. Set the `JAVA_HOME` environment variable to the JDK **bundled inside Android Studio**
   (Android Studio → Settings → Gradle → use the embedded JDK, or add
   `C:\Program Files\Android\Android Studio\jbr` to PATH)

### Step 2 — Install Capacitor in the project

Inside the `SmartRegistrar` folder:

```text
npm install @capacitor/core @capacitor/cli @capacitor/android
```

The file `capacitor.config.json` is already provided:

```json
{
  "appId": "ph.cdlshs.smartregistrar",
  "appName": "SmartRegistrar",
  "webDir": "public",
  "android": { "allowMixedContent": true },
  "server": { "androidScheme": "http" }
}
```

### Step 3 — Create the Android project

```text
npx cap add android
npx cap sync
```

This generates the `android/` folder containing the native Android project.

### Step 4 — Build the APK

**Option A — Android Studio (recommended):**

```text
npx cap open android
```

In Android Studio: wait for Gradle sync to finish, then
**Build → Build Bundle(s) / APK(s) → Build APK(s)**.
The APK appears at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

**Option B — command line:**

```text
cd android
gradlew assembleDebug
```

### Step 5 — Install on a phone

- Copy `app-debug.apk` to the phone and tap it (enable **Install unknown apps**), **or**
- Connect the phone with USB (developer mode + USB debugging on) and run:

```text
npx cap run android
```

### Step 6 — Connect the APK to your server

1. Start the server on the PC (`npm start`) — note the LAN IP (e.g. `192.168.1.100`)
2. Phone and PC on the **same Wi-Fi**
3. Open the SmartRegistrar app → the **Connect to Server** screen appears
4. Enter: `http://192.168.1.100:3000` → tap **Connect**
5. Log in as usual — the address is remembered for next time

> To change the server address later: clear the app data (or reinstall), or use the
> address you last typed — the app asks again if it cannot reach the server.

---

## 9. Testing Instructions

### Automated tests

With the server running (`npm start`), open a **second** terminal in the project folder:

```text
node test-api.js        ← 52 API checks (auth, booking, double-booking, QR, security…)
node test-frontend.js   ← 39 UI checks (every screen, booking flow, dark mode…) 
```

Expected: `Results: 52 passed, 0 failed` and `Results: 39 passed, 0 failed`.

### Manual test script (for demonstrations / defense)

| # | Steps | Expected result |
|---|---|---|
| 1 | Go to login → wrong password | Error: "Incorrect email or password" |
| 2 | Register a new student account | Can log in immediately after |
| 3 | Student → **Book Appointment** → pick service, date, time → confirm | Reference like `APT-0023` + QR code shown |
| 4 | Second phone/student books the **same slot** | Blocked: "double booking prevented" |
| 5 | Admin dashboard → **Appointments** → Approve the booking | Status becomes Approved; student gets notification |
| 6 | Admin → **Reschedule** → choose another slot | Moves appointment; status resets to Pending; student notified |
| 7 | Student → **Request Document** (Form 138, purpose…) | Reference like `REQ-0006` created |
| 8 | Admin → **Requests** → set *Ready for Pickup* | Student sees status + gets notification |
| 9 | Admin → **Availability** → add slot / close a whole day | Students immediately see (or lose) that slot |
| 10 | Show QR on student phone → Admin **Scanner** → manual code entry | Shows student, ref, service, date, status (no sensitive data) |
| 11 | Student → **Customer Service** → send inquiry → Admin replies | Student sees reply + notification |
| 12 | Moon/Sun button on any screen | Dark/light mode switches and **stays** after refresh |
| 13 | Open on phone via `http://<PC-IP>:3000` | Same features, bottom navigation, no horizontal scrolling |
| 14 | Admin → **Reports** | Live charts (statuses, monthly, top documents) |
| 15 | Admin → **Activity Logs** | Every action above is recorded |

---

## 10. API Reference

Base URL: `http://<host>:3000/api` — all routes (except login/register) require the header
`Authorization: Bearer <token>`.

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/login` | public | Email + password → token + user |
| POST | `/auth/register` | public | Student self-registration |
| GET | `/auth/me` | logged in | Current user + student profile |
| GET/POST | `/students` | admin | List (with search/filter) / add |
| GET/PUT/DELETE | `/students/:id` | admin | View profile+history / edit / delete |
| GET | `/slots` | logged in | Open slots for booking |
| GET | `/slots/all`, `/slots/dates` | admin | Every slot / available dates |
| POST/PUT/DELETE | `/slots…` | admin | Add / edit / close / delete slots |
| POST | `/slots/close-date` | admin | Close or reopen a whole day |
| POST | `/appointments` | student | Book a slot (double-booking safe) |
| GET | `/appointments` | logged in | Student: own · Admin: all (+filters) |
| PUT | `/appointments/:id/status` | role-checked | Approve/Reject/Complete/Cancel |
| PUT | `/appointments/:id/reschedule` | admin | Move to another free slot |
| GET/POST | `/requests…` | logged in/student | Types, list, submit |
| PUT | `/requests/:id/status` | role-checked | Update request status |
| GET/PUT | `/notifications…` | logged in | List, unread count, mark read |
| GET/POST | `/chat…` | logged in | Inquiries; admin replies/resolve |
| GET/POST/DELETE | `/announcements…` | logged in/admin | Read / post / delete |
| GET | `/dashboard/stats` | logged in | Card numbers for dashboards |
| GET | `/reports`, `/logs` | admin | Report data, activity log |
| GET | `/qr/lookup?code=…` | logged in | Resolve APT-/REQ-/STU- codes |

---

## 11. Troubleshooting Guide

**"npm is not recognized"**
→ Node.js is not installed or the terminal was opened before installing. Install from nodejs.org, then open a *new* terminal.

**Port 3000 already in use (`EADDRINUSE`)**
→ Another program uses port 3000. Either close it, or change the port:
edit `.env` → `PORT=3001` → `npm start` → open `http://localhost:3001`.

**Phone cannot open the page**
1. Phone and PC must be on the **same Wi-Fi** (check the Wi-Fi name on both)
2. Re-run `ipconfig` — the PC's IP may have changed; use the new one
3. Windows Firewall → allow `node.exe` on **Private** networks (Section 7, step 3)
4. Turn off any VPN on either device
5. Test on the PC first: `http://localhost:3000` must work

**Login says "Cannot reach the server" (in APK)**
→ The server address is wrong or the PC is unreachable. Verify `http://<PC-IP>:3000`
opens in the phone's *browser* first. Same Wi-Fi? Server running? Firewall allowed?

**Camera scanner does not start**
→ Browsers only allow camera access on **localhost** or **HTTPS**. On `http://IP` use the
**manual lookup** field (type the reference shown under the QR), or open the scanner on the
PC itself (`localhost`), or build the APK (which requests camera permission).

**"Database is locked" or data looks stale**
→ Only run **one** server instance. Stop old windows (close them) and start one `npm start`.

**Passwords stopped working / want a fresh demo**
→ Delete `database/smart-registrar.db` and restart — sample data is recreated.
(All demo data is regenerated; anything you entered is lost.)

**Change the admin password**
→ Register/login normally, or edit the database with any SQLite browser and replace the
`password_hash` of `admin@cdlshs.edu.ph` with a new bcrypt hash. (Simplest demo approach:
delete the DB, seed fresh, and change `hashPassword('admin123')` in `server/seed.js`.)

**Firebase / internet errors**
→ None possible — this system does **not** use Firebase or any cloud service. If you see
internet-related messages, you are opening an *old* project file.

**App looks broken / old version showing**
→ Press **Ctrl+F5** (hard refresh) in the browser, or clear the APK's app data.

**Gradle / Android Studio build errors**
→ Let Android Studio finish its first-time setup before building; make sure the Gradle JDK
points to the embedded JDK (`jbr` folder). Then run `npx cap sync` again and rebuild.

---

### Quick command cheat-sheet

```text
npm install          ← once, after cloning/copying the project
npm start            ← start the server (keep this window open)
npm run seed         ← (optional) seed an empty database
node test-api.js     ← run API tests (server must be running)
node test-frontend.js← run UI tests (server must be running)
ipconfig             ← find your LAN IP
npx cap add android  ← (APK) create Android project once
npx cap sync         ← (APK) copy web files into the Android project
npx cap open android ← (APK) open Android Studio
```

---

*Smart Registrar System · CDLSHS · Developed for the Grade 12 ICT Research Project*
