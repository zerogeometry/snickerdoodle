# Publishes the TEST SITE to Netlify. The build runs in a Linux container (Docker) because Netlify's
# servers are Linux: a Windows build would bundle Windows-only image libraries (sharp, resvg).
# Uses your `netlify login` (mounted read-only-ish into the container) and the site linked in .netlify/.
# Secrets come from the Netlify site settings (push-settings.ps1), never from files in the build.
#   & .\scripts\test-site\deploy.ps1
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$netlifyCfg = Join-Path $env:APPDATA 'netlify\Config'
if (-not (Test-Path (Join-Path $netlifyCfg 'config.json'))) { throw 'not logged in to Netlify - run: npx netlify-cli login' }
if (-not (Test-Path (Join-Path $root '.netlify\state.json'))) { throw 'this folder is not linked to a Netlify site' }

$copy = 'mkdir -p /app && cd /src && tar ' +
  '--exclude=./node_modules --exclude=./.next --exclude="./.next-*" --exclude=./.prodigi-assets ' +
  '--exclude=./reports --exclude=./research_notes --exclude=./sample-art --exclude=./scripts/sample-art ' +
  '--exclude=./test-results --exclude=./playwright-report --exclude="./.env*" --exclude=./.git ' +
  '-cf - . | tar -xf - -C /app'
$build = 'cd /app && npm ci --no-audit --no-fund && npx --yes netlify-cli deploy --build --prod'

docker run --rm `
  -v "${root}:/src:ro" `
  -v "${netlifyCfg}:/root/.config/netlify" `
  node:22-bookworm bash -c "$copy && $build"
