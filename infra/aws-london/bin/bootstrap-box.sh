#!/usr/bin/env bash
# One-time set-up of a FRESH Lightsail Ubuntu 24.04 box (runbook §4.2). Safe to run again.
#   copy the kit first:   scp -r infra/aws-london ubuntu@<ip>:/tmp/kit
#   then on the box:      sudo bash /tmp/kit/bin/bootstrap-box.sh
#
# Installs Docker (from Docker's apt repo), the AWS CLI v2, jq; turns on automatic security
# updates; puts the kit at /opt/snickerdoodle/kit; installs the systemd units (start at boot +
# nightly DB backup); sets Docker's log rotation. It does NOT touch AWS and holds no secrets — the
# AWS key and box.env are separate steps (runbook §4.3).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run with sudo" >&2; exit 1; }
src="$(cd "$(dirname "$0")/.." && pwd)"
. /etc/os-release
[ "${ID:-}" = ubuntu ] || echo "warning: written for Ubuntu 24.04 LTS; this is ${PRETTY_NAME:-unknown}"

echo "== packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg jq unzip unattended-upgrades
install -m 0755 -d /etc/apt/keyrings
if [ ! -s /etc/apt/keyrings/docker.asc ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

if ! command -v aws >/dev/null; then
  echo "== AWS CLI v2"
  tmp="$(mktemp -d)"
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "$tmp/awscli.zip"
  unzip -q "$tmp/awscli.zip" -d "$tmp"
  "$tmp/aws/install" --update
  rm -rf "$tmp"
fi

echo "== automatic security updates (reboots at 03:40 UTC only if a kernel update needs it)"
cat > /etc/apt/apt.conf.d/52snickerdoodle-upgrades <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:40";
EOF
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Docker logging (rotated on the box: ~50 MB per container, then the oldest goes)"
if [ ! -s /etc/docker/daemon.json ]; then
  install -m 0644 "$src/docker/daemon.json" /etc/docker/daemon.json
  systemctl restart docker
fi

echo "== the kit → /opt/snickerdoodle/kit"
install -d -m 0755 /opt/snickerdoodle /opt/snickerdoodle/prodigi-assets
install -d -m 0700 /opt/snickerdoodle/state
if [ "$src" != /opt/snickerdoodle/kit ]; then
  rm -rf /opt/snickerdoodle/kit.new
  cp -r "$src" /opt/snickerdoodle/kit.new
  rm -rf /opt/snickerdoodle/kit
  mv /opt/snickerdoodle/kit.new /opt/snickerdoodle/kit
fi
chmod 0755 /opt/snickerdoodle/kit/bin/*.sh /opt/snickerdoodle/kit/scheduler/run-job.sh
chown -R root:root /opt/snickerdoodle/kit

echo "== settings file"
install -d -m 0755 /etc/snickerdoodle
if [ ! -e /etc/snickerdoodle/box.env ]; then
  install -m 0644 /opt/snickerdoodle/kit/env/box.env.example /etc/snickerdoodle/box.env
  echo "   → now edit /etc/snickerdoodle/box.env (runbook §4.3)"
fi

echo "== systemd: start at boot + nightly backup"
install -m 0644 /opt/snickerdoodle/kit/systemd/*.service /opt/snickerdoodle/kit/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable docker snickerdoodle.service snickerdoodle-backup.timer
systemctl start snickerdoodle-backup.timer

echo
echo "bootstrap done. Next (runbook §4.3): the box's AWS key in /root/.aws/credentials, then box.env."
