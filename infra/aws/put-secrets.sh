#!/usr/bin/env bash
# Adds the real site's settings to AWS Parameter Store (London). Run it in AWS CloudShell,
# signed in as yourself (Actions → Upload file, then: bash put-secrets.sh).
#
# - AUTH_SECRET and JOBS_SECRET are made for you (and never replaced once they exist).
# - Everything else it asks for; press Enter to keep what's already there or skip an optional one.
# - Secret answers aren't shown as you type, and nothing is printed back.
# The CloudFormation stack already added the bucket and key settings.
set -euo pipefail
export AWS_REGION=eu-west-2 AWS_DEFAULT_REGION=eu-west-2
APP=/snickerdoodle/prod/app
BOX=/snickerdoodle/prod/box

exists() { aws ssm get-parameter --name "$1" --query Parameter.Name --output text >/dev/null 2>&1; }

# Sent on stdin as JSON, so the value never appears on a command line.
put() {
  local name="$1" type="$2" value="$3"
  if [[ "$value" =~ [\"\\\$\`] || "$value" == *$'\n'* ]]; then
    echo "  ✗ ${name##*/} can't contain quotes, backslashes, \$ or backticks — not saved" >&2
    return 1
  fi
  jq -n --arg n "$name" --arg t "$type" --arg v "$value" '{Name: $n, Type: $t, Value: $v, Overwrite: true}' |
    aws ssm put-parameter --cli-input-json file:///dev/stdin >/dev/null
  echo "  ✓ ${name##*/} saved"
}

generate() {
  if exists "$1"; then
    echo "  · ${1##*/} already set — kept"
  else
    put "$1" SecureString "$(openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48)"
  fi
}

# ask <name> <SecureString|String> <question> [default]
ask() {
  local name="$1" type="$2" question="$3" default="${4:-}" answer
  local hint=""
  exists "$name" && hint=" (Enter keeps the current one)"
  [[ -n "$default" && -z "$hint" ]] && hint=" [$default]"
  if [[ "$type" == SecureString ]]; then
    read -rsp "  ${question}${hint}: " answer
    echo
  else
    read -rp "  ${question}${hint}: " answer
  fi
  if [[ -z "$answer" ]]; then
    if exists "$name"; then
      echo "  · ${name##*/} kept"
      return 0
    fi
    answer="$default"
  fi
  if [[ -z "$answer" ]]; then
    echo "  · ${name##*/} skipped"
    return 0
  fi
  put "$name" "$type" "$answer" || true
}

echo "Made for you:"
generate "$APP/AUTH_SECRET"
generate "$APP/JOBS_SECRET"

echo
echo "The site:"
ask "$APP/APP_URL" String "Site address" "https://snickerdoodle.co.uk"
ask "$BOX/SITE_DOMAIN" String "Domain only, for the HTTPS certificate" "snickerdoodle.co.uk"
ask "$BOX/ACME_EMAIL" String "Email for certificate expiry notices"
ask "$APP/PRIVACY_INBOX" String "Where privacy requests are emailed"

echo
echo "Email (decision D7):"
ask "$APP/MAIL_PROVIDER" String "Mail provider" "resend"
ask "$APP/MAIL_FROM" String "From address, e.g. snickerdoodle <hello@mail.snickerdoodle.co.uk>"
ask "$APP/RESEND_API_KEY" SecureString "Resend API key (EU region)"

echo
echo "Payments and printing:"
ask "$APP/STRIPE_SECRET_KEY" SecureString "Stripe secret key"
ask "$APP/STRIPE_WEBHOOK_SECRET" SecureString "Stripe webhook signing secret (whsec_…)"
ask "$APP/PRODIGI_API_KEY" SecureString "Prodigi API key"
ask "$APP/PRODIGI_BASE_URL" String "Prodigi address" "https://api.sandbox.prodigi.com/v4.0"

echo
echo "The box:"
ask "$BOX/BACKUP_AGE_RECIPIENT" String "Backup key, PUBLIC half (age1…)"
ask "$BOX/ALERT_WEBHOOK_URL" SecureString "Slack/Discord webhook for 'something failed' alerts (optional)"

cat <<'EOF'

Done. Not set here on purpose:
  POD_MODE=LIVE and LG3_TRANSFER_ASSESSMENT_SIGNED_OFF — only at the documented sign-off (LG3/LG6).
  MODERATION_PROVIDER — until the real moderation adapter exists, production holds every upload.
Add those in Parameter Store under /snickerdoodle/prod/app/ when the time comes, then on the box:
  sudo sd-fetch-secrets --restart
EOF
