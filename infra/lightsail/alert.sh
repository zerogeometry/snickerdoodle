#!/usr/bin/env bash
# sd-alert <what> — run by snickerdoodle-alert@<what>.service when a unit fails. Sends WHICH unit
# failed (never its log, which could hold personal data) to ALERT_WEBHOOK_URL, if set, as
# {"text": …, "content": …} — the shape Slack and Discord webhooks take. Always logs locally.
set -uo pipefail

what="${1:-unknown}"
what="${what//[^a-zA-Z0-9._-]/_}"
case "$what" in
  app) unit=snickerdoodle-app ;;
  backup) unit=snickerdoodle-backup ;;
  caddy) unit=caddy ;;
  job-*) unit="snickerdoodle-job@${what#job-}" ;;
  *) unit="$what" ;;
esac
msg="snickerdoodle: ${unit} failed on $(hostname) at $(date -u +%Y-%m-%dT%H:%M:%SZ). To see why: sudo journalctl -u ${unit} -n 50"
logger -t sd-alert -- "$msg"

if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
  body="$(jq -cn --arg t "$msg" '{text: $t, content: $t}')"
  # the URL is a secret: give it to curl on stdin, not on the command line
  printf 'url = "%s"\n' "$ALERT_WEBHOOK_URL" |
    curl -fsS --max-time 15 -K - -H 'content-type: application/json' --data "$body" -o /dev/null ||
    logger -t sd-alert -- "could not reach the alert webhook"
fi
exit 0
