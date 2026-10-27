#!/usr/bin/env bash
# sd-job — run the job runner by hand on the box, as the app user, against the local app:
#
#   sudo sd-job --list
#   sudo sd-job --once seed-catalogue
#   sudo sd-job --once reapply-erasures --since 2026-10-27T02:30:00Z --print-body
#
# (The timers run the scheduled jobs by themselves: systemctl list-timers 'snickerdoodle-*'.)
set -euo pipefail
[[ $EUID -eq 0 ]] || {
  echo "run me with sudo" >&2
  exit 1
}
set -a
# shellcheck source=/dev/null
. /etc/snickerdoodle/jobs.env
set +a
cd /opt/snickerdoodle/current
exec runuser -u snickerdoodle -- /usr/bin/node scripts/jobs.mjs "$@"
