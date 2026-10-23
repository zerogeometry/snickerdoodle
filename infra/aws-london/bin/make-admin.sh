#!/usr/bin/env bash
# The box version of scripts/make-admin.ts (tsx isn't in the production image): make an account
# an admin, or take it away. Deliberately no button for this in the app.
#   sudo make-admin.sh you@example.com            → admin (two-step login is set up on first visit)
#   sudo make-admin.sh you@example.com --remove   → not an admin, two-step secret wiped
source "$(dirname "$0")/lib.sh"
need_root
load_box_env
email="$(tr '[:upper:]' '[:lower:]' <<<"${1:-}" | xargs)"
[[ "$email" == *@* ]] || { echo "usage: make-admin.sh <email> [--remove]" >&2; exit 2; }
[ -r "$RUN_DIR/app.env" ] || "$KIT_DIR/bin/fetch-env.sh"
DATABASE_URL="$(app_setting DATABASE_URL)"
export DATABASE_URL
if [ "${2:-}" = --remove ]; then
  sql="update accounts set is_admin = false, mfa_secret = null where email = :'email' returning id"
else
  sql="update accounts set is_admin = true where email = :'email' returning id"
fi
net=()
[ "${COMPOSE_PROFILES:-}" = local-db ] && net=(--network snickerdoodle)
# the email goes in as a psql variable (quoted by psql), never pasted into the SQL
rows="$(docker run --rm -i "${net[@]}" -e DATABASE_URL -e EMAIL="$email" "${POSTGRES_IMAGE:-postgres:16-bookworm}" \
  sh -c 'psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -v email="$EMAIL" -tA' <<<"$sql" | grep -c . || true)"
if [ "$rows" = 0 ]; then echo "no account for $email — sign in to the site once first, then run this again" >&2; exit 1; fi
[ "${2:-}" = --remove ] && echo "$email is no longer an admin" || echo "$email is an admin — open /admin/review to set up two-step login"
