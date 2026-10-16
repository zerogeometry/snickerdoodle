# Sends .env.test-site (local, never committed) to the linked Netlify test site's settings.
# Run from the repo root:  & .\scripts\test-site\push-settings.ps1
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$file = Join-Path $root '.env.test-site'
if (-not (Test-Path $file)) { throw ".env.test-site not found - run: node scripts/test-site-env.mjs https://your-site.netlify.app" }
Set-Location $root
# the CLI prints every value it imports - swallow that so secrets never land on screen
& 'C:\Program Files\nodejs\npx.cmd' --yes netlify-cli env:import $file --replace-existing *> $null
if ($LASTEXITCODE -ne 0) { throw 'importing the settings failed - run it again without *> $null to see why (it will print the values)' }
Write-Host 'settings sent to Netlify (values not shown). Redeploy for them to take effect.'
