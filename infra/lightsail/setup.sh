#!/usr/bin/env bash
# Sets up a fresh Lightsail box (Ubuntu 24.04 LTS, London) for Snickerdoodle. Safe to run again:
# every step checks before it changes anything. Run as root from a clone of the repo:
#
#   sudo /opt/snickerdoodle/src/infra/lightsail/setup.sh
#
# It installs Node 22, Postgres 16 (localhost only, least-privilege roles), Caddy (HTTPS),
# the AWS CLI, automatic security updates, a firewall (22/80/443) and fail2ban, then the
# systemd units. It never handles a secret except the database passwords it makes itself,
# which go to /etc/snickerdoodle/*.env (root only). See infra/README.md.
set -euo pipefail

main() {
  [[ $EUID -eq 0 ]] || die "run me with sudo"
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  . /etc/os-release
  [[ "${ID:-}" == ubuntu ]] || die "this is for Ubuntu (found ${ID:-unknown})"
  [[ "${VERSION_ID:-}" == 24.04 ]] || warn "written for Ubuntu 24.04; this is ${VERSION_ID:-unknown}"
  export DEBIAN_FRONTEND=noninteractive

  step "clock and swap"
  timedatectl set-timezone UTC
  if ! swapon --show | grep -q .; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  fi

  step "packages"
  install -d -m 0755 /etc/apt/keyrings
  add_repo nodesource https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    "https://deb.nodesource.com/node_22.x nodistro main"
  add_repo caddy https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    "https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg jq git age \
    postgresql-16 postgresql-client-16 nodejs caddy \
    ufw fail2ban python3-systemd unattended-upgrades >/dev/null
  node -e 'process.exit(Number(process.versions.node.split(".")[0]) === 22 ? 0 : 1)' || die "expected Node 22, got $(node -v)"
  # The AWS CLI is published by AWS as a snap and updates itself.
  command -v aws >/dev/null || snap install aws-cli --classic >/dev/null

  step "automatic security updates"
  cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
  cat >/etc/apt/apt.conf.d/52snickerdoodle-upgrades <<'EOF'
// Node and Caddy security fixes too, not just Ubuntu's.
Unattended-Upgrade::Origins-Pattern {
  "site=deb.nodesource.com";
  "site=dl.cloudsmith.io";
};
// Reboot when an update needs it, at a quiet time (UTC) clear of the nightly backup and jobs.
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:45";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
  systemctl enable --now unattended-upgrades >/dev/null

  step "firewall and SSH"
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  cat >/etc/ssh/sshd_config.d/50-snickerdoodle.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
  sshd -t && systemctl try-reload-or-restart ssh
  cat >/etc/fail2ban/jail.d/snickerdoodle.conf <<'EOF'
[sshd]
enabled = true
backend = systemd
EOF
  systemctl enable fail2ban >/dev/null
  systemctl restart fail2ban

  step "app user and folders"
  id snickerdoodle >/dev/null 2>&1 ||
    useradd --system --home-dir /var/lib/snickerdoodle --create-home --shell /usr/sbin/nologin snickerdoodle
  install -d -m 0755 -o root -g root /opt/snickerdoodle /opt/snickerdoodle/releases
  install -d -m 0700 -o root -g root /etc/snickerdoodle

  step "postgres (localhost only)"
  cat >/etc/postgresql/16/main/conf.d/snickerdoodle.conf <<'EOF'
# Snickerdoodle: one small box shared with the app.
listen_addresses = 'localhost'
password_encryption = scram-sha-256
max_connections = 50
shared_buffers = 256MB
effective_cache_size = 768MB
work_mem = 8MB
maintenance_work_mem = 64MB
EOF
  systemctl enable postgresql >/dev/null
  systemctl restart postgresql
  step "systemd units and helper commands"
  install_box_files "$HERE"

  step "database roles"
  make_db_roles
  apply_db_grants
  systemctl enable caddy >/dev/null

  step "done"
  cat <<EOF

The box is ready. Next (infra/README.md, steps 5–7):
  1. sudo aws configure --profile snickerdoodle      (the app user's access key, region eu-west-2)
  2. sudo sd-fetch-secrets                            (settings from Parameter Store)
  3. sudo $HERE/deploy.sh main                        (build, migrate, start)
EOF
}

# Creates sd_migrator (owns the schema) and sd_app (rows only) with passwords made here, kept in
# /etc/snickerdoodle/{migrate,db}.env. Re-running re-applies the stored passwords.
make_db_roles() {
  local app_pw mig_pw
  if [[ -f /etc/snickerdoodle/db.env && -f /etc/snickerdoodle/migrate.env ]]; then
    app_pw="$(sed -n 's#^DATABASE_URL="postgres://sd_app:\([0-9a-f]*\)@.*#\1#p' /etc/snickerdoodle/db.env)"
    mig_pw="$(sed -n 's#^DATABASE_URL="postgres://sd_migrator:\([0-9a-f]*\)@.*#\1#p' /etc/snickerdoodle/migrate.env)"
  fi
  [[ -n "${app_pw:-}" ]] || app_pw="$(openssl rand -hex 32)"
  [[ -n "${mig_pw:-}" ]] || mig_pw="$(openssl rand -hex 32)"
  # Passwords travel on stdin, never on a command line.
  runuser -u postgres -- psql -q -v ON_ERROR_STOP=1 -d postgres <<SQL
SELECT 'CREATE ROLE sd_migrator' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sd_migrator')\gexec
SELECT 'CREATE ROLE sd_app' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sd_app')\gexec
ALTER ROLE sd_migrator WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${mig_pw}';
ALTER ROLE sd_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 40 PASSWORD '${app_pw}';
SELECT 'CREATE DATABASE snickerdoodle OWNER sd_migrator' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'snickerdoodle')\gexec
ALTER DATABASE snickerdoodle OWNER TO sd_migrator;
SQL
  write_secret_file /etc/snickerdoodle/db.env "DATABASE_URL=\"postgres://sd_app:${app_pw}@127.0.0.1:5432/snickerdoodle\""
  write_secret_file /etc/snickerdoodle/migrate.env "DATABASE_URL=\"postgres://sd_migrator:${mig_pw}@127.0.0.1:5432/snickerdoodle\""
}

add_repo() {
  local name="$1" key_url="$2" line="$3"
  if [[ ! -s "/etc/apt/keyrings/$name.gpg" ]]; then
    curl -fsSL "$key_url" | gpg --dearmor --yes -o "/etc/apt/keyrings/$name.gpg"
    chmod 0644 "/etc/apt/keyrings/$name.gpg"
  fi
  echo "deb [signed-by=/etc/apt/keyrings/$name.gpg] $line" >"/etc/apt/sources.list.d/$name.list"
}

# shellcheck source=infra/lightsail/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
main "$@"
