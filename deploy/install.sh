#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Smart Registrar — one-shot server installer (Ubuntu 22.04/24.04)
# Usage:  bash deploy/install.sh yourdomain.com
# Prereq: project uploaded at /opt/smart-registrar  (see DEPLOY.md)
# ============================================================
DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: bash deploy/install.sh yourdomain.com"
  exit 1
fi
APP_DIR=/opt/smart-registrar
if [ ! -d "$APP_DIR" ]; then
  echo "ERROR: $APP_DIR not found — upload the project there first (see DEPLOY.md)"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> Updating packages"
apt-get update -y
apt-get install -y curl ca-certificates gnupg

echo "==> Installing Node.js 24 (needed for node:sqlite)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
echo "    node $(node -v)"

echo "==> Installing Caddy (free automatic HTTPS)"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
echo "    $(caddy version | head -n1)"

echo "==> Creating service user"
id -u registrar >/dev/null 2>&1 || useradd -r -m -d /var/lib/registrar -s /usr/sbin/nologin registrar

echo "==> Preparing app in $APP_DIR"
cd "$APP_DIR"
[ -f .env ] || cp .env.example .env
if grep -q 'change-me-to-a-long-random-secret' .env; then
  SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$SECRET/" .env
  echo "    - generated a random JWT_SECRET"
fi
sed -i 's/^HOST=.*/HOST=127.0.0.1/' .env
grep -q '^SEED_SAMPLE=' .env || printf '\n# no example students on the server\nSEED_SAMPLE=0\n' >> .env
sed -i 's/^SEED_SAMPLE=.*/SEED_SAMPLE=0/' .env
mkdir -p database/backups
chown -R registrar:registrar "$APP_DIR"

echo "==> Installing dependencies"
sudo -u registrar npm install --omit=dev

echo "==> systemd service"
cp deploy/smart-registrar.service /etc/systemd/system/smart-registrar.service
systemctl daemon-reload
systemctl enable --now smart-registrar
sleep 3
if ! systemctl is-active --quiet smart-registrar; then
  echo "ERROR: service failed to start:"
  systemctl status smart-registrar --no-pager -l
  exit 1
fi
echo "    - smart-registrar: active"

echo "==> Caddy — HTTPS for $DOMAIN"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "no-referrer"
	}
}
CADDY
systemctl reload caddy 2>/dev/null || systemctl restart caddy

echo "==> Daily database backup (2:15 AM, keeps last 14)"
cat > /etc/cron.d/smart-registrar <<CRON
15 2 * * * registrar cd $APP_DIR && /usr/bin/node scripts/backup.js >> /var/log/smart-registrar-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/smart-registrar

echo "==> Firewall (only if ufw is active)"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q 'Status: active'; then
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
fi

echo
echo "DONE. Ensure DNS A record for $DOMAIN points to this server's public IP."
echo "Then open: https://$DOMAIN"
