# Smart Registrar — Demo & Defense Script

> CDLSHS Smart Registrar · Appointment & Document Request System
> Live: https://smart-registrar.onrender.com
> APK: `downloads/SmartRegistrar.apk` (also copied to `C:\Users\Admin\Downloads\SmartRegistrar.apk`)

---

## 0. Quick cheat sheet (memorize these)

| Item | Value |
|---|---|
| Admin login | `admin@cdlshs.edu.ph` / `registrar123` |
| Student login | `demo.student@cdlshs.edu.ph` / `demo1234` (8 chars max for students) |
| Document request statuses | Pending → Under Review → Processing → Ready for Pickup → Completed |
| Rejection | **Wala** sa document requests. Appointments lang ang may Rejected/Cancelled. |
| QR scan | Nag-start ng **24-hour claim window**; pag lumipas, auto-Completed |
| QR reuse | **Single-use** — pag Completed na ang request, hindi na maipapakita o ma-scan ang QR |
| Completed timestamp | Oras ng QR scan (o oras ng manual Completed) |
| Slots | Registrar ang nagtatakda kung **ilan**; hinahati nang pantay ang time range; **1 student per slot** |
| Registration fields | LRN, Email, Name, Grade, Strand, **School Year Last Attended**, Contact, Password |
| Tests | **573 automated checks** (22 persistence + 293 API + 258 frontend) |
| Stack | HTML/CSS/JS + Node.js/Express + SQLite + JWT/bcrypt + Capacitor Android + Render |

---

## 1. Before the defense (checklist)

Do this **30–60 minutes before**:

- [ ] Open https://smart-registrar.onrender.com sa laptop at phone para **mag-wake up** ang Render free instance (pwedeng 30–60s ang first load).
- [ ] Install the latest APK sa phone. Test: login, open Requests, open QR.
- [ ] Charge phone + laptop. Prepare hotspot backup.
- [ ] Prepare **two views**: laptop = admin, phone = student.
- [ ] Pre-create demo data (huwag umasa sa live OTP sa defense):
  - [ ] Student account `demo.student@cdlshs.edu.ph` / `demo1234`
  - [ ] Isang request na **Pending** (para sa status demo)
  - [ ] Isang request na **Ready for Pickup** na may pickup date/time (para sa QR demo)
  - [ ] Isang **Pending appointment** (para sa approve/queue demo)
- [ ] Backup: screenshots o 2–3 min screen recording ng buong flow, kung sakaling mawalan ng internet.
- [ ] Close unnecessary tabs/apps. I-off ang notifications na pwedeng mag-popup.
- [ ] Itakda ang phone sa **Do Not Disturb** para hindi ma-cut ang demo.
- [ ] Huwag mag-delete ng student o request habang demo.

> **Importante:** huwag mag-demo ng live registration kung email OTP ang kailangan at mahina ang internet. Ipakita lang ang registration form at sabihing “pre-registered na ang demo account para hindi na maghintay ng OTP.”

---

## 2. Demo accounts & data

### Admin (laptop)
- Email: `admin@cdlshs.edu.ph`
- Password: `registrar123`

### Student (phone)
- Email: `demo.student@cdlshs.edu.ph`
- Password: `demo1234`

### Suggested demo data
| Data | Layunin |
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
> Sa dating proseso, ang estudyante ay pumipila, nagtatanong nang paulit-ulit kung ready na ang dokumento, at manual na nila-trace ng registrar ang bawat request. Madalas din nawawala ang update sa estudyante.
>
> Ang Smart Registrar ay may **web version at Android APK**. Ito ay may:
> - online student registration,
> - appointment booking at digital queue,
> - document requests na may malinaw na status,
> - QR-based claiming na may 24-hour window,
> - notifications at email updates,
> - at registrar dashboard na may reports, analytics, at activity logs.
>
> Ang goal namin: **bawasan ang pila, gawing transparent ang status, at gawing traceable ang bawat request** — para sa estudyante at sa registrar.”

---

## 4. Live demo (15 minutes)

### 4.1 Student registration at profile (2 min)

**Phone / student side**

1. Buksan ang APK (o live site sa phone).
2. Pindutin ang **Register**.
3. Ipakita ang fields:
   - LRN
   - Email
   - First / Last / Middle Name
   - Grade / Level
   - Strand
   - **School Year Last Attended** (hal. `2024-2025`)
   - Contact Number
   - Password
4. **Sabihin:**
   > “Bawat estudyante ay may sariling account. Required ang LRN at School Year Last Attended para tama ang record at para may baseline kung kailan siya huling nag-aral.”
5. Ipakita ang **Profile**: LRN, grade, strand, **SY Last Attended**, contact, at profile photo.
6. **Sabihin:**
   > “Makikita rin ito ng registrar sa Student Records, kasama ang pinakabagong request.”

> Kung pre-registered ang account, sabihin: “Pre-registered na po ito para hindi na maghintay ng OTP sa demo.”

---

### 4.2 Appointment booking at digital queue (3 min)

**Phone / student side**

1. Pumunta sa **Schedule**.
2. Pumili ng service (hal. Certificate of Enrollment).
3. Pumili ng **date** at **open slot**.
4. Ilagay ang purpose.
5. Pindutin ang **Book appointment**.
6. Ipakita ang confirmation at reference (`APT-000X`).

**Laptop / admin side**

7. Pumunta sa **Appointments**.
8. Ipakita ang bagong booking at ang **Queue** column.
9. Pindutin ang **Approve** (o **Approve all pending**).
10. Pumunta sa **Digital Queue**.
11. Ipakita ang **NOW SERVING** panel.
12. Pindutin ang **Call** → lalabas ang pangalan.
13. Pindutin ang **Served** → completed ang appointment.

**Sabihin:**
> “Hindi na kailangan ng papel na pila. Ang registrar ang nag-call ng student, at real-time na nakikita kung sino ang naka-serve.”

---

### 4.3 Document request + status + pickup schedule + expected release (4 min)

**Phone / student side**

1. Pumunta sa **Requests** → **+ New Request**.
2. Pumili ng document type (hal. **SF9 / Report Card**).
3. Ipakita ang **requirements panel**:
   - “What you need”
   - “Processing: 1 day(s)”
   - Kasama ang **“No disciplinary case on record”**
4. Ilagay ang quantity at purpose.
5. Pindutin ang **Submit request**.
6. Ipakita ang bagong request na **Pending**.

**Laptop / admin side**

7. Pumunta sa **Requests**.
8. Hanapin ang bagong request.
9. Ipakita ang **status dropdown** — isang malinaw na control lang, hindi apat na buttons.
10. Ilagay sa **Under Review**.
11. Ilagay sa **Processing**.
12. Ilagay sa **Ready for Pickup** → lalabas ang **pickup scheduler**.
13. Pumili ng **pickup date** at **pickup time** → **Save schedule**.
14. Ipakita ang **Expected Release** column → pindutin ang **+ Set** → pumili ng date → **Save date**.
15. **Sabihin:**
    > “Ang registrar ang may control sa status at schedule. Ang Expected Release Date ay manually itinatakda ng registrar, at makikita ito ng estudyante. Wala tayong ‘Rejected’ sa document requests — Under Review ang tamang step kung may kailangang i-verify.”

**Phone / student side**

16. I-refresh ang **Requests**.
17. Ipakita:
    - bagong status,
    - pickup date/time,
    - **Expected release** date,
    - notification.

18. **Sabihin:**
    > “Transparent sa estudyante kung nasaan na ang request, kailan kukunin, at kailan ine-expect na ma-release.”

---

### 4.4 QR scan at 24-hour claim window (2 min)

**Laptop / admin side**

1. Pumunta sa **QR Scanner**.
2. I-scan ang QR ng request (o i-type ang reference).
3. Ipakita ang verdict at ang **24-hour claim window**.
4. **Sabihin:**
   > “Pag na-scan ang QR, nagsisimula ang 24-hour claim window. Kapag lumipas ito, automatic na magiging Completed ang request. Ang completed timestamp ay ang oras ng scan — hindi ang oras ng sweep — para accurate ang record.”

**Laptop / admin side — patunay na single-use ang QR**

5. I-complete ang request (manual o hintayin ma-expire ang window).
6. Bumalik sa **Requests** at ipakita ang row: disabled na ang QR button at **QR used** na ang label.
7. I-scan muli ang parehong QR o i-type ang reference sa **QR Scanner** → **USED** ang verdict at refused ang scan.
8. **Sabihin:**
   > “Kapag Completed na ang request, single-use na ang QR — hindi na ito magagamit ulit. USED ang lumalabas sa scanner, at conflict ang sagot ng claim API. Kaya hindi maikle-claim nang dalawang beses ang parehong dokumento.”

**Phone / student side**

9. Buksan ang **My QR** at ipakita ang student QR (active transactions lang).
10. Buksan ang **Requests** → ang completed request ay may **QR already used** sa halip na QR button.
11. **Sabihin:**
   > “Ang QR ang identity at transaction reference. Hindi na ito magagamit kapag Completed na ang request, at pwede pa ring manual na i-complete ng registrar kung kailangan.”

---

### 4.5 Student Records + Document Requirements (2 min)

**Laptop / admin side**

1. Pumunta sa **Students**.
2. Ipakita ang columns:
   - LRN
   - Name
   - Grade
   - Strand
   - **SY Last Attended**
   - Contact
   - **Document Requested**
   - **Request Status**
   - **Request Date**
3. **Sabihin:**
   > “Isang tingin lang, makikita na ng registrar ang pinakabagong request ng estudyante — hindi na kailangang maghanap pa sa ibang page.”

4. Pumunta sa **Requirements**.
5. Ipakita ang types:
   - **SF9 / Report Card**
   - **Other Certifications**
   - **No Disciplinary Case**
6. Pindutin ang **Edit** sa isang type.
7. Ipakita na pwedeng baguhin ang:
   - name
   - description
   - requirements (one per line)
   - processing days
   - active/disabled
8. **Sabihin:**
   > “Hindi natin dine-delete ang document types — dine-disable lang, para hindi masira ang history ng mga lumang request. Ang requirements ay pwedeng i-edit ng registrar.”

---

### 4.6 Chat at notifications (1 min)

**Phone / student side**

1. Pumunta sa **Customer Service**.
2. Mag-send ng inquiry (hal. “Kailan po ready ang SF9 ko?”).

**Laptop / admin side**

3. Pumunta sa **Customer Service**.
4. Ipakita ang inquiry at mag-reply.
5. **Sabihin:**
   > “May direct chat ang estudyante at registrar. May notification at email din ang estudyante kapag nag-reply o nagbago ang status.”

**Phone / student side**

6. Ipakita ang **Alerts** at ang bagong notification.

---

### 4.7 Reports, analytics, at activity logs (1 min)

**Laptop / admin side**

1. Pumunta sa **Reports** → ipakita ang printable requests/appointments/summary.
2. Pumunta sa **Analytics** → ipakita ang completion rate, top documents, students by grade, feedback.
3. Pumunta sa **Activity Logs** → ipakita ang search, action filter, at date range.
4. **Sabihin:**
   > “May audit trail ang bawat aksyon. Nakikita ng registrar kung sino ang nagbago ng status, kailan, at aling request.”

---

## 5. Speed run (7 minutes)

Kung kulang ang oras, ito lang ang ipakita:

1. **Student:** login → Requests → bagong request → status.
2. **Admin:** Requests → status dropdown → Ready for Pickup + schedule → Expected Release.
3. **Student:** notification + pickup + expected release.
4. **Admin:** QR Scanner → 24-hour window.
5. **Admin:** Students (request summary) + Requirements (Edit).
6. **Admin:** Analytics/Reports (isang slide lang).
7. **Closing.**

---

## 6. Optional technical walkthrough (3 minutes)

**Sabihin habang ipinapakita ang repo:**

> “Ang frontend ay HTML, CSS, at vanilla JavaScript. Ang backend ay Node.js at Express. Ang database ay SQLite gamit ang `node:sqlite`. Ang authentication ay JWT at bcrypt. Ang Android app ay ginawa gamit ang Capacitor, kaya isang codebase lang ang web at APK.”

Ipakita:

- `server/index.js` — app entry at routes
- `server/db.js` — schema, migrations, backfill
- `server/routes/` — auth, students, requests, appointments, slots, chat, misc
- `server/persistence.js` — cloud snapshot restore
- `public/js/views/` — student at admin views
- `test-api.js`, `test-frontend.js`, `test-persistence.js` — automated tests

**Sabihin:**
> “May 573 automated checks kami: persistence, API, at frontend. Kaya bawat bagong feature, may regression test.”

---

## 7. Closing script (1 minute)

> “Sa kabuuan, ang Smart Registrar ay hindi lang digitized form. Ito ay:
> - **transparent** — limang malinaw na status at expected release date;
> - **traceable** — QR, activity logs, at completed timestamps;
> - **efficient** — appointment slots, digital queue, at pickup scheduling;
> - **accessible** — web at Android APK;
> - at **susukat** — reports at analytics para sa desisyon ng registrar.
>
> Sa susunod na phase, plano naming idagdag ang **push notifications at quick reply** para kahit nasa ibang app ang estudyante, makakatanggap pa rin siya ng update at makakasagot sa chat mula sa notification.
>
> Thank you, panel. Ready kami sa questions.”

---

## 8. Defense Q&A (with suggested answers)

### A. Policy at proseso

**Q: Bakit walang “Rejected” o “Cancelled” sa document requests?**
> “Deliberate policy po iyon. Ang document request ay hindi dapat basta-basta ma-reject nang walang paliwanag. Kapag may kulang o kailangang i-verify, **Under Review** ang status. Ang appointments lang ang may Rejected/Cancelled dahil may schedule silang pwedeng i-cancel. Napanatili namin ang lumang rows sa database para hindi masira ang history, pero hindi na sila ginagamit ng API o UI.”

**Q: Paano kung nagkamali ang registrar sa status?**
> “Pwede niyang ibalik sa Processing o Under Review gamit ang parehong dropdown. May activity log ang bawat pagbabago. Ang pickup schedule lang ang naka-lock kapag Completed, para hindi mabago ang historical record.”

**Q: Bakit manual ang Expected Release Date, hindi auto-compute?**
> “Mas realistic po ang manual sa school setting: may holidays, backlog, at special cases. Ang registrar ang may tunay na kaalaman kung kailan talaga ma-release. Pero may processing days ang bawat document type bilang guide. Pwede ring i-clear ang date kung hindi pa sure.”

**Q: Bakit hindi na-delete ang document types?**
> “Para hindi masira ang history. Kung may lumang request na gumamit ng type na iyon, dapat may record pa rin. **Disable** lang ang ginagawa namin, at hindi na ito lumalabas sa students.”

**Q: Bakit may “No disciplinary case on record” sa requirements?**
> “Standard clearance po ito ng school. Idinagdag namin sa requirements list ng bawat type para malinaw sa estudyante bago mag-request. Naka-idempotent migration ito, kaya hindi nadodoble kahit i-restore ang snapshot.”

### B. Technical

**Q: Ano ang tech stack?**
> “HTML, CSS, at vanilla JavaScript ang frontend. Node.js at Express ang backend. SQLite ang database. JWT at bcrypt para sa auth. Capacitor para sa Android APK. Naka-host sa Render, at may snapshot backup sa cloud storage.”

**Q: Bakit SQLite?**
> “Single-school load po ito, kaya sapat at mabilis ang SQLite. Zero-config at madaling i-backup. Kung lalaki ang deployment, pwedeng mag-migrate sa PostgreSQL nang hindi binabago ang business logic.”

**Q: Paano nagpe-persist ang data sa Render na ephemeral ang disk?**
> “May persistence layer na kumukuha ng snapshot at nagre-restore mula sa cloud storage. May migration at backfill din pagkatapos ng restore, kaya kahit lumang snapshot ang ma-restore, nadadagdagan ng bagong columns at naitatama ang completed timestamps.”

**Q: Paano ninyo nase-secure ang accounts?**
> “Bcrypt ang password hashing. JWT ang session. May role-based access — student at admin lang ang pwedeng gumawa ng kanya-kanyang aksyon. May lockout pagkatapos ng 5 failed logins, may OTP rate limit, may input validation, at parameterized SQL queries para sa SQL injection.”

**Q: Paano ang duplicate bookings at requests?**
> “May database constraints at server-side checks. Sa slots, all-or-nothing ang creation at may duplicate check. Sa appointments, isang booking lang per slot. Sa requests, may reference number at validation.”

**Q: Paano accurate ang completed timestamp?**
> “Dalawa ang source: kapag na-scan ang QR, ang `claimed_at` ang ginagamit; kapag manual na pinindot ang Completed, ang server time. Hindi ginagamit ang oras ng sweep. Kaya tama ang record kahit every minute ang auto-complete job.”

**Q: Paano gumagana ang QR?**
> “Ang QR ay naglalaman ng reference. Sa scanner, vine-verify ng server kung valid, kung nasa claim window, o used na. Pag first scan, nagsisimula ang 24-hour window. Re-scanning does not restart the clock. Kapag Completed na ang request, single-use na ang QR: USED ang verdict, 409 ang claim endpoint, at tinatago na ng UI ang QR button — kaya hindi na ito magagamit ulit.”

**Q: Ano ang automated tests?**
> “573 checks: 22 persistence, 293 API, 258 frontend. Sinusubukan ang auth, roles, statuses, pickup, QR, slots, chat, reports, migrations, at UI flows.”

**Q: Bakit Capacitor at hindi native?**
> “Isang codebase lang ang web at Android. Mabilis i-maintain at i-deploy. Ang APK ay nagbibigay ng app icon at install experience, habang ang web ay para sa laptop/registrar.”

### C. Usability at impact

**Q: Paano nabawasan ang pila?**
> “May appointment slots at digital queue. Ang registrar ang nag-call ng student, kaya hindi na naghihintay nang patayo. May pickup schedule din para sa document claiming.”

**Q: Paano nalalaman ng estudyante ang update?**
> “May in-app notifications, status sa Requests page, at email via Brevo para sa status changes at pickup schedule. Sa susunod na phase, push notifications at quick reply.”

**Q: Paano kung walang internet?**
> “Online-first po ang system. Ang APK ay nag-o-open ng app, pero kailangan ng connection para sa live data. Plano naming magdagdag ng offline caching at sync sa future.”

**Q: Paano ang data privacy?**
> “Minimal data lang ang kinukuha. Role-based ang access. Hindi nagpapakita ng sensitive fields ang public QR lookup. May activity logs para sa accountability. Susunod na hakbang ang mas pormal na privacy impact assessment at consent notice.”

### D. Limitations at future work

**Q: Ano ang limitations ng system?**
> “Kailangan ng internet. Wala pang push notification/quick reply. Wala pang payment at SMS. Single-school ang design. Manual pa ang expected release date. Pwedeng mag-migrate sa PostgreSQL para sa mas malaking scale.”

**Q: Ano ang future work?**
> “FCM push notifications na may quick reply, offline mode, SMS reminders, online payment, multi-school support, mas detalyadong analytics, at automated backup/restore monitoring.”

**Q: Bakit walang online payment?**
> “Out of scope po muna. Ang focus ay appointment, request tracking, at claiming. Pwede itong idagdag sa susunod na phase kapag may payment gateway ang school.”

---

## 9. If something goes wrong

| Problem | Gawin |
|---|---|
| Render is slow / sleeping | Sabihin: “Nagwa-wake up lang po ang free instance.” Ipakita ang backup screenshot/video. |
| Internet fails | I-switch sa phone hotspot. Kung wala pa rin, gamitin ang screen recording. |
| OTP email delayed | Huwag mag-live register. Login sa pre-created demo account. |
| Wrong data / na-delete | Huwag mag-panic. I-refresh. Kung kailangan, gumamit ng backup account. |
| Scanner camera fails | I-type ang reference sa manual input. |
| Na-click ang maling status | Ibalik sa tamang status gamit ang dropdown; may activity log. |
| Panel asks about a feature not yet done | Sabihin honestly: “Hindi pa po kasama sa scope; nasa future work.” |

---

## 10. Limitations & future work (slide-ready)

**Limitations**
- Online-first; needs internet.
- No push notification / quick reply yet.
- No SMS or online payment.
- Single-school deployment.
- Manual expected release date.
- SQLite for current load.

**Future work**
- FCM push + Android quick reply.
- Offline mode at background sync.
- SMS reminders.
- Payment integration.
- Multi-school / PostgreSQL.
- Privacy impact assessment at consent management.

---

## 11. One-liners to memorize

- “**Limang status, walang rejection** — Under Review ang sagot sa hindi malinaw.”
- “**QR scan starts the 24-hour claim window; completed time = scan time.**”
- “**Single-use ang request QR** — pag Completed na, USED ang verdict at hindi na ma-scan.”
- “**Registrar decides how many slots**; the range is split evenly; one student per slot.”
- “**Expected release date is manual** because the registrar knows the real constraints.”
- “**Student Records shows the latest request** — document, status, and date — in one row.”
- “**Types are disabled, never deleted**, so history stays intact.”
- “**573 automated checks** — persistence, API, and frontend.”
- “**Web at APK, isang codebase** — via Capacitor.”

---

## 12. Sample panel questions about the latest changes

**Q: Bakit may School Year Last Attended sa registration?**
> “Para may baseline ang registrar kung kailan huling nag-aral ang estudyante. Makakatulong ito sa verification ng records at sa paghahanap ng tamang file. Required siya sa form pero lenient sa server para sa lumang clients.”

**Q: Bakit pinakita sa Student Records ang request status at date?**
> “Para isang tingin lang ang registrar. Dati kailangang pumunta pa sa Requests page. Ngayon, nasa student row na ang latest document, status, at request date.”

**Q: Bakit may Edit sa Document Requirements?**
> “Nagbabago ang requirements ng school. Hindi pwedeng hard-coded. Ang registrar ang may control sa description, requirements, processing days, at active status.”

**Q: Paano ninyo sinisiguro na tama ang expected release date?**
> “Manual ito at server-validated. Valid calendar date lang ang tinatanggap. May notification at email sa student kapag sinuset o kinlear. Makikita ito sa admin at student side.”

---

*End of script. Good luck sa defense!*
