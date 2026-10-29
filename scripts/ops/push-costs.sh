#!/usr/bin/env bash
# Loads each product's Prodigi costs (unit cost + first/extra-item postage) into the LIVE database,
# so the multi-buy tiers (src/pricing/multibuy.ts) and the promo margin guard have real numbers.
# Re-run after any price or Prodigi cost change. Runs the same scripts/discount-headroom.mjs as
# locally, inside a throwaway copy of the live app image on the box, against the cost sheets
# already in /opt/snickerdoodle/prodigi-assets/pricing. Prints only the script's summary.
#
# Uses Git Bash's ssh (Windows' own OpenSSH refuses the key file while other groups can read it).
# From PowerShell, in the project folder:
#   & "C:\Program Files\Git\bin\bash.exe" scripts/ops/push-costs.sh
#   & "C:\Program Files\Git\bin\bash.exe" scripts/ops/push-costs.sh --check   # dry run: writes nothing
set -euo pipefail
WRITE="--write-costs"
if [ "${1:-}" = "--check" ]; then WRITE=""; echo "(check only: the live database is read, nothing is written)"; fi
KEY="${KEY:-C:/Users/Simon/Documents/awskeys/LightsailDefaultKey-eu-west-2.pem}"
BOX="${BOX:-ubuntu@51.24.234.157}"
cd "$(dirname "$0")/../.."

echo "copying the cost script to the box…"
scp -q -o BatchMode=yes -i "$KEY" scripts/discount-headroom.mjs "$BOX:/tmp/costs.mjs"

echo "running the cost script against the live database…"
ssh -o BatchMode=yes -i "$KEY" "$BOX" "WRITE='$WRITE' bash -s" <<'REMOTE'
set -e
IMG=$(sudo docker inspect snickerdoodle-app-1 --format "{{.Config.Image}}")
NET=$(sudo docker inspect snickerdoodle-app-1 --format "{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}}{{end}}")
# run as the live app user (the settings file is readable by it alone, mode 400)
APPUSER=$(sudo docker inspect snickerdoodle-app-1 --format "{{.Config.User}}")
sudo docker run --rm --network "$NET" --user "$APPUSER" \
  --tmpfs "/work:uid=${APPUSER%%:*},gid=${APPUSER##*:}" \
  -v /tmp/costs.mjs:/app/costs-tmp.mjs:ro \
  -v /opt/snickerdoodle/prodigi-assets/pricing:/pricing:ro \
  -v /run/snickerdoodle/app.env:/run/secrets/app.env:ro \
  --entrypoint sh "$IMG" -c "mkdir -p /work/.prodigi-assets && ln -s /pricing /work/.prodigi-assets/pricing && cd /work && exec node --env-file=/run/secrets/app.env /app/costs-tmp.mjs $WRITE" > /tmp/costs.log 2>&1 || { echo "the cost script failed:"; tail -5 /tmp/costs.log; rm -f /tmp/costs.mjs /tmp/costs.log; exit 1; }
rm -f /tmp/costs.mjs /tmp/costs.log
echo "done ✓"
REMOTE
