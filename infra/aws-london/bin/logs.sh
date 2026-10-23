#!/usr/bin/env bash
# The box's logs, the easy way.
#   sudo logs.sh              # everything, last 200 lines, then follow
#   sudo logs.sh app          # one service: app | caddy | scheduler | db
#   sudo logs.sh jobs         # just the scheduled-job results
#   sudo logs.sh status       # what's running, which image, health
source "$(dirname "$0")/lib.sh"
need_root
load_box_env
case "${1:-}" in
  status)
    dc ps
    echo "live:     $(current_image)"
    echo "previous: $(previous_image)"
    curl -sS --max-time 5 http://127.0.0.1:3000/api/health; echo
    tail -n 5 "$STATE_DIR/history.log" 2>/dev/null || true ;;
  jobs) dc logs --no-log-prefix --tail 200 scheduler | grep '\[jobs\]' ;;
  "") dc logs --tail 200 -f ;;
  *) dc logs --tail 200 -f "$1" ;;
esac
