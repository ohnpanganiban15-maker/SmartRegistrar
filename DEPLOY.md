# DEPLOY.md — Paano ilagay online (hindi na LAN-based)

Lokal pa rin ang lahat — ang VPS lang ang "server". Libreng HTTPS ang Caddy, auto-backup araw-araw.

---

## 1. Bilihin (one-time setup, ~₱350–500/buwan)

### VPS (virtual server)
| Provider | Presyo | Rekomendasyon |
|---|---|---|
| **Vultr** (Singapore) | ~$5/mo (~₱290) | Pinakamalapit sa PH = mabilis. Card/PayPal/GrabPay card |
| **DigitalOcean** (Singapore) | ~$6/mo | Kagaya ng Vultr |
| **RackNerd** (promo) | ~$11–20/**taon** | Pang-budget; US region (mas mabagal pero okay lang) |

**Settings kapag gumawa:** OS = **Ubuntu 24.04 LTS**, region = Singapore kung meron.
**Sa firewall ng panel (Vultr/DigitalOcean: "Firewall" tab):** i-open ang TCP **22, 80, 443**.

### Domain
- **Namecheap / Cloudflare Registrar / GoDaddy** — ~₱500/taon (.com); unang taon ng `.xyz` ~₱100.
- Sa **DNS panel** ng domain: gumawa ng **A record**
  - Name: `@` → Value: **IP address ng VPS** → Save
  - (optional) `www` → parehong IP

---

## 2. I-upload ang project

1. Sa PowerShell (buksan sa project folder), gumawa ng zip na **WALANG** `node_modules`:
   ```powershell
   $keep = 'public','server','scripts','deploy','package.json','package-lock.json','.env.example','.env'
   Compress-Archive -Path $keep -DestinationPath SmartRegistrar.zip -Force
   ```
2. I-upload gamit ang **WinSCP** o **FileZilla** (protocol **SFTP**, address = IP ng VPS, user `root`):
   - destination: `/opt/` → dapat sa loob nito ay folder na **`smart-registrar`**
   - kaya: i-extract sa PC → pangalanan ang folder `smart-registrar` → i-drag sa `/opt/`

> Kasama ang `.env` — ang install ang mag-aayos ng laman nito (JWT_SECRET, HOST, SEED_SAMPLE).

---

## 3. Install (isang command)

```bash
ssh root@<VPS-IP>

cd /opt
unzip SmartRegistrar.zip -d smart-registrar
bash smart-registrar/deploy/install.sh yourdomain.com
```

Ang ginagawa nito (mga 3–5 minuto): Node 24 · Caddy (libreng auto-HTTPS) · systemd service (auto-restart sa boot) · random JWT_SECRET · **SEED_SAMPLE=0** (walang example students sa server) · daily backup sa 2:15 AM.

---

## 4. Unang login

1. Browser → **https://yourdomain.com**
2. Login: `admin@cdlshs.edu.ph` / `admin123`
3. **PALITAN AGAD** ang password (gear/change password sa app).

---

## 5. Ang APK

Sa login/setup screen ng app → **Change server** → type:
```
https://yourdomain.com
```
→ login. (Gumagana kahit naka-data/wifi kahit saan.)

---

## 6. Data safety

- **Auto-backup** araw-araw 2:15 AM → `database/backups/` (14 huling kopya; via live-safe `VACUUM INTO`).
- **I-download buwan-buwan** sa WinSCP (drag palabas ng server).
- **Restore** kapag nasira ang DB:
  ```bash
  systemctl stop smart-registrar
  cp database/backups/smart-registrar-<DATE>.db database/smart-registrar.db
  systemctl start smart-registrar
  ```

---

## 7. Pang-araw-araw na utos

| Kailangan | Utos |
|---|---|
| Status | `systemctl status smart-registrar` |
| Restart | `systemctl restart smart-registrar` |
| Live logs | `journalctl -u smart-registrar -f` |
| Update ng code | i-upload ang bagong files sa `/opt/smart-registrar` → `systemctl restart smart-registrar` |
| Backup now | `cd /opt/smart-registrar && node scripts/backup.js` |

---

## Troubleshooting

- **502 Bad Gateway** → hindi tumataas ang app: `journalctl -u smart-registrar -n 50`.
- **Hindi pa umu-HTTPS / "certificate" error** → tiyaking tama ang A record (IP) at bukas ang **80/443** sa firewall ng VPS; bigyan ng 1–2 minuto si Caddy, tapos i-refresh.
- **Node kulang** → `node -v` dapat ≥ v24 (muling patakbuhin ang install.sh).

---

## Bakit hindi Libreng-host (Render/Glitch)?

Piliin kung wala talagang budget: **ok para sa demo**, pero:
- SQLite DB = **nawawala pag redeploy/restart** (Render free = ephemeral disk)
- natutulog pag walang tao (~50s bumangon)
- walang control sa backup

Kaya VPS + domain = **permanentong data + permanentong URL**.
