#!/usr/bin/env bash
# Deploys a version of the app on the Lightsail box:
#
#   sudo /opt/snickerdoodle/src/infra/lightsail/deploy.sh [branch, tag or commit — default main]
#
# Fetches it, builds it in a fresh folder (the live site keeps running meanwhile), runs database
# migrations, re-applies the least-privilege grants, installs the box config and job timers
# from that version, switches over, and checks the app answers. If it doesn't, it switches
# back to the previous version. Migrations are not undone (they only ever add).
set -euo pipefail

SRC=/opt/snickerdoodle/src
BASE=/opt/snickerdoodle
ETC=/etc/snickerdoodle

main() {
  # shellcheck source=infra/lightsail/lib.sh
  . "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
  [[ $EUID -eq 0 ]] || die "run me with sudo"
  local ref="${1:-main}"

  # Stage 1: fetch, check out the target, then re-run THAT version of this script.
  if [[ "${SD_DEPLOY_STAGE:-1}" == 1 ]]; then
    git -C "$SRC" fetch --quiet --prune --tags origin
    local target
    target="$(git -C "$SRC" rev-parse --verify --quiet "origin/$ref^{commit}" || git -C "$SRC" rev-parse --verify --quiet "$ref^{commit}")" ||
      die "can't find \"$ref\" in the repository"
    git -C "$SRC" checkout --quiet --detach "$target"
    SD_DEPLOY_STAGE=2 SD_DEPLOY_SHA="$target" exec bash "$SRC/infra/lightsail/deploy.sh" "$ref"
  fi

  local sha="${SD_DEPLOY_SHA:?}"
  local rel="$BASE/releases/${sha:0:12}"
  for f in app.env db.env migrate.env jobs.env caddy.env; do
    [[ -f "$ETC/$f" ]] || die "$ETC/$f is missing — run setup.sh, then sudo sd-fetch-secrets"
  done

  step "build ${sha:0:12} ($ref)"
  if [[ ! -f "$rel/.built" ]]; then
    rm -rf "$rel"
    install -d -o snickerdoodle -g snickerdoodle "$rel"
    git -C "$SRC" archive "$sha" | runuser -u snickerdoodle -- tar -x -C "$rel"
    # Third-party install scripts run WITHOUT any of our settings in reach.
    (cd "$rel" && runuser -u snickerdoodle -- env -i PATH=/usr/bin:/bin HOME=/var/lib/snickerdoodle \
      npm ci --no-audit --no-fund --loglevel=error)
    (
      cd "$rel"
      set -a
      # shellcheck source=/dev/null
      . "$ETC/app.env"
      # shellcheck source=/dev/null
      . "$ETC/db.env"
      set +a
      NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 runuser -u snickerdoodle -- npm run build
    )
    # The code becomes read-only to the app; only Next's own output folder stays writable.
    chown -R root:root "$rel"
    chown -R snickerdoodle:snickerdoodle "$rel/.next"
    touch "$rel/.built"
  else
    echo "already built"
  fi

  step "database migrations"
  (
    cd "$rel"
    set -a
    # shellcheck source=/dev/null
    . "$ETC/migrate.env"
    set +a
    runuser -u snickerdoodle -- npm run --silent db:migrate
  )

  step "box config from this version"
  check_caddyfile "$rel/infra/lightsail/Caddyfile"
  install_box_files "$rel/infra/lightsail"
  apply_db_grants
  for t in /etc/systemd/system/snickerdoodle-job-*.timer; do
    if [[ -e "$t" ]]; then systemctl disable --now "$(basename "$t")" >/dev/null 2>&1 || true; fi
  done
  local timers
  mapfile -t timers < <(node "$rel/scripts/jobs.mjs" --write-timers /etc/systemd/system)
  ((${#timers[@]} > 0)) || die "couldn't write the job timers"
  systemctl daemon-reload

  step "switch over"
  local prev=""
  [[ -L "$BASE/current" ]] && prev="$(readlink -f "$BASE/current")"
  point_current_at "$rel"
  systemctl enable snickerdoodle-app >/dev/null 2>&1
  systemctl restart snickerdoodle-app
  if ! app_answers; then
    if [[ -n "$prev" && "$prev" != "$rel" && -d "$prev" ]]; then
      point_current_at "$prev"
      systemctl restart snickerdoodle-app
      die "the new version didn't answer, so the site is back on $(basename "$prev"). See: sudo journalctl -u snickerdoodle-app -n 100"
    fi
    die "the app didn't answer. See: sudo journalctl -u snickerdoodle-app -n 100"
  fi
  systemctl reload-or-restart caddy
  systemctl enable --now "${timers[@]}" snickerdoodle-backup.timer >/dev/null 2>&1 || die "couldn't start the timers"

  step "tidy up"
  # keep the three newest releases, plus whatever is live
  local live
  live="$(readlink -f "$BASE/current")"
  while read -r old; do
    [[ "$old" == "$live" ]] || rm -rf "$old"
  done < <(find "$BASE/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | tail -n +4 | cut -d' ' -f2-)

  echo
  echo "live: ${sha:0:12} ($ref)"
  systemctl list-timers --no-pager 'snickerdoodle-*'
}

point_current_at() {
  ln -sfn "$1" "$BASE/current.next"
  mv -Tf "$BASE/current.next" "$BASE/current"
}

app_answers() {
  for _ in $(seq 1 45); do
    curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:3000/ && return 0
    sleep 2
  done
  return 1
}

check_caddyfile() {
  (
    set -a
    # shellcheck source=/dev/null
    . "$ETC/caddy.env"
    set +a
    caddy validate --adapter caddyfile --config "$1" >/dev/null
  ) || die "the Caddyfile in this version is invalid, so nothing was switched; the site is unchanged"
}

main "$@"
exit
