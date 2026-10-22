#!/bin/sh
# run-job <name> [timeout-seconds] — POST the app's /api/jobs/<name> route with the jobs secret.
# Runs inside the scheduler container (alpine + busybox: wget, flock). One line per run goes to
# the container log — "[jobs] ok …" or "[jobs] FAILED …" — which is what the log alarm watches
# (runbook §6). Response bodies are not printed (the app logs its own detail on failure).
set -u
name="$1"
timeout="${2:-600}"
case "$name" in *[!a-z0-9-]*|'') echo "[jobs] FAILED bad job name"; exit 2 ;; esac
secret_file=/run/secrets/jobs_secret
if [ ! -s "$secret_file" ]; then echo "[jobs] FAILED $name: no jobs secret mounted"; exit 1; fi

(
  # one at a time per job: a slow run is never stacked on by the next tick
  if ! flock -n 9; then echo "[jobs] skip $name: previous run still going"; exit 0; fi
  start=$(date +%s)
  # the header is built from the secret file here and never echoed
  if wget -q -O /dev/null -T "$timeout" \
      --header "Authorization: Bearer $(cat "$secret_file")" \
      --post-data '' "${APP_INTERNAL_URL:-http://app:3000}/api/jobs/$name" 2>/tmp/run-job-$name.err; then
    echo "[jobs] ok $name ($(( $(date +%s) - start ))s)"
  else
    code=$?
    reason=$(head -c 200 /tmp/run-job-$name.err | tr '\n' ' ')
    echo "[jobs] FAILED $name after $(( $(date +%s) - start ))s (exit $code): $reason"
  fi
  rm -f /tmp/run-job-$name.err
) 9>/tmp/run-job-$name.lock
