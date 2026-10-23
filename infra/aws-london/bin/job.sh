#!/usr/bin/env bash
# Run one of the app's /api/jobs/* routes by hand, on the box, over the loopback port (the jobs
# routes are closed to the internet by Caddy). Prints the app's JSON answer.
#   sudo job.sh seed-mockups                 # after copying new Prodigi blanks (runbook §4.6)
#   sudo job.sh seed-catalogue
#   sudo job.sh retention
#   sudo job.sh 'reapply-erasures?since=2026-10-23T02:30:00Z'   # normally done by restore-db.sh
source "$(dirname "$0")/lib.sh"
need_root
load_box_env
name="${1:?usage: job.sh <job name>[?query]}"
[[ "$name" =~ ^[a-z0-9-]+(\?[A-Za-z0-9=:._%-]+)?$ ]] || die "bad job name '$name'"
[ -r "$RUN_DIR/jobs_secret" ] || "$KIT_DIR/bin/fetch-env.sh"
curl -sS -X POST --max-time "${JOB_TIMEOUT:-1800}" -w '\n(HTTP %{http_code})\n' \
  -H "authorization: Bearer $(cat "$RUN_DIR/jobs_secret")" "http://127.0.0.1:3000/api/jobs/$name"
