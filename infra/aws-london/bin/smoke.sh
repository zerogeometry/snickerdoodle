#!/usr/bin/env bash
# Post-deploy smoke test — no CI needed. Run it ON THE BOX (deploy.sh does) or from any computer
# with curl (Git Bash / WSL on Windows):
#
#   sudo /opt/snickerdoodle/kit/bin/smoke.sh                 # on the box: public + internal checks
#   infra/aws-london/bin/smoke.sh https://snickerdoodle.co.uk  # anywhere: the public checks only
#
# Public checks: /api/health says ok; the home page loads over HTTPS with the security headers;
# http:// redirects to https://; the jobs routes are NOT reachable from outside.
# On the box it also asks the app (loopback) to draw one mockup with its real picture libraries
# (/api/health/render, jobs-secret guarded) — the brand-safe example painting, no customer data.
set -uo pipefail

base="${1:-}"
on_box=0
if [ -z "$base" ] && [ -r /etc/snickerdoodle/box.env ]; then
  # shellcheck disable=SC1091
  base="https://$(sed -n 's/^SITE_DOMAIN=//p' /etc/snickerdoodle/box.env)"
  on_box=1
fi
[ -n "$base" ] || { echo "usage: smoke.sh https://your-domain" >&2; exit 2; }
base="${base%/}"
host="${base#https://}"

fails=0
pass() { printf '  ok    %s\n' "$*"; }
fail() { printf '  FAIL  %s\n' "$(head -n1 <<<"$*")"; fails=$((fails + 1)); }

echo "smoke test: $base"

# Give HTTPS a moment first: right after a deploy Caddy may still be starting, and on a new box it
# is fetching the first certificate (up to a minute). SMOKE_WAIT seconds, then judge.
deadline=$(( $(date +%s) + ${SMOKE_WAIT:-90} ))
until curl -fsS --max-time 5 -o /dev/null "$base/api/health" 2>/dev/null || [ "$(date +%s)" -ge "$deadline" ]; do sleep 3; done

body="$(curl -fsS --max-time 15 "$base/api/health" 2>&1)" && grep -q '"ok":true' <<<"$body" \
  && pass "health: $body" || fail "health: ${body:-no answer}"

# -L: in test mode (SITE_MODE=test) the home page redirects to the password page, which is fine
headers="$(curl -sSL -o /dev/null -D - --max-time 30 -w 'status=%{http_code} time=%{time_total}s\n' "$base/" 2>&1)"
grep -q 'status=200' <<<"$headers" && pass "home page: $(grep -o 'status=.*' <<<"$headers")" || fail "home page: $(grep -o 'status=.*' <<<"$headers" || echo 'no answer')"
grep -qi '^strict-transport-security:' <<<"$headers" && pass "HSTS header present" || fail "no Strict-Transport-Security header"
grep -qi '^x-frame-options: *DENY' <<<"$headers" && pass "X-Frame-Options: DENY" || fail "no X-Frame-Options: DENY"

redirect="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 15 "http://$host/" 2>&1)"
[[ "$redirect" =~ ^30[178]\ https:// ]] && pass "http → https ($redirect)" || fail "http does not redirect to https ($redirect)"

code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST --max-time 15 "$base/api/jobs/retention" 2>&1)"
[ "$code" = 404 ] && pass "jobs routes closed to the internet" || fail "jobs route answered $code from outside (expected 404 from Caddy)"

if [ "$on_box" = 1 ]; then
  if [ -r /run/snickerdoodle/jobs_secret ]; then
    render="$(curl -fsS -X POST --max-time 60 -H "authorization: Bearer $(cat /run/snickerdoodle/jobs_secret)" \
      http://127.0.0.1:3000/api/health/render 2>&1)"
    grep -q '"ok":true' <<<"$render" && pass "mockup render: $render" || fail "mockup render: ${render:-no answer}"
  else
    fail "mockup render: can't read /run/snickerdoodle/jobs_secret (run with sudo)"
  fi
else
  echo "  skip  mockup render (only from the box: sudo /opt/snickerdoodle/kit/bin/smoke.sh)"
fi

if [ "$fails" -eq 0 ]; then echo "smoke test passed"; else echo "smoke test: $fails check(s) FAILED"; fi
exit $(( fails > 0 ))
