# Seeds the TEST SITE database from this computer: the catalogue, then the mockups.
# Uses .env.test-site (refuses unless it says SITE_MODE=test) and never prints a setting.
# Run from anywhere in the repo:
#   & .\scripts\test-site\seed.ps1                  # catalogue, then mockups
#   & .\scripts\test-site\seed.ps1 -Only catalogue
#   & .\scripts\test-site\seed.ps1 -Only mockups
param([ValidateSet('', 'catalogue', 'mockups')][string]$Only = '')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$tsx = Join-Path $root 'node_modules\tsx\dist\cli.mjs'
if (-not (Test-Path $tsx)) { throw 'node_modules is missing - run: npm ci' }
if (-not (Test-Path (Join-Path $root '.env.test-site'))) { throw '.env.test-site not found - run: node scripts/test-site-env.mjs https://your-site.netlify.app' }

Push-Location $root
$prevOptions = $env:NODE_OPTIONS
$prevPref = $ErrorActionPreference
try {
  # react-server: lets the server-only modules load outside Next (as the Next server does)
  $env:NODE_OPTIONS = '--conditions=react-server'
  $ErrorActionPreference = 'Continue' # node's stderr is output, not failure — the exit code decides
  if ($Only) { & node $tsx 'scripts/test-site/seed.ts' $Only } else { & node $tsx 'scripts/test-site/seed.ts' }
  $code = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $prevPref
  $env:NODE_OPTIONS = $prevOptions
  Pop-Location
}
if ($code -ne 0) { throw "seeding failed (exit code $code) - see the message above" }
