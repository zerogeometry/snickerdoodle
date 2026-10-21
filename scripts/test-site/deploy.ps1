# Publishes the TEST SITE to Netlify. The build runs in a Linux container (Docker) because Netlify's
# servers are Linux: a Windows build would bundle Windows-only image libraries (sharp, resvg).
# Uses your `netlify login` (mounted read-only-ish into the container) and the site linked in .netlify/.
# Secrets come from the Netlify site settings (push-settings.ps1), never from files in the build.
#   & .\scripts\test-site\deploy.ps1
#
# Native tools (docker, npm, netlify) write progress and warnings to STDERR. Under Windows
# PowerShell 5.1 with $ErrorActionPreference='Stop', the first stderr line from a redirected native
# command is turned into a terminating error — the deploy died on npm's first warning. So the
# native call runs with 'Continue' and success is judged ONLY by its exit code ($LASTEXITCODE).
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$netlifyCfg = Join-Path $env:APPDATA 'netlify\Config'
if (-not (Test-Path (Join-Path $netlifyCfg 'config.json'))) { throw 'not logged in to Netlify - run: npx netlify-cli login' }
if (-not (Test-Path (Join-Path $root '.netlify\state.json'))) { throw 'this folder is not linked to a Netlify site' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is not installed or not on PATH - start Docker Desktop and try again' }

# Copy the source into the container WITHOUT: dependencies/builds (rebuilt inside), local assets,
# secrets (.env*), git history, and .claude/worktrees — full extra copies of the source that
# would otherwise be tarred into the build.
$copy = 'mkdir -p /app && cd /src && tar ' +
  '--exclude=./node_modules --exclude=./.next --exclude="./.next-*" --exclude=./.prodigi-assets ' +
  '--exclude=./reports --exclude=./research_notes --exclude=./sample-art --exclude=./scripts/sample-art ' +
  '--exclude=./test-results --exclude=./playwright-report --exclude="./.env*" --exclude=./.git ' +
  '--exclude=./.claude/worktrees --exclude="*/node_modules" ' +
  '-cf - . | tar -xf - -C /app'
$build = 'cd /app && npm ci --no-audit --no-fund && npx --yes netlify-cli deploy --build --prod'

$lines = New-Object System.Collections.Generic.List[string]
$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue' # stderr is progress, not failure — the exit code decides
try {
  & docker run --rm `
    -v "${root}:/src:ro" `
    -v "${netlifyCfg}:/root/.config/netlify" `
    node:22-bookworm bash -c "$copy && $build" 2>&1 | ForEach-Object {
      $line = "$_" # an ErrorRecord (a stderr line) prints as its plain text
      Write-Host $line
      $lines.Add($line)
    }
  $code = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $prev
}
if ($code -ne 0) { throw "deploy failed (exit code $code) - scroll up for the first error" }

# The live URL, from the Netlify CLI's own summary (colour codes stripped).
$esc = [char]27 # (PowerShell 5.1 has no `e escape)
$plain = $lines | ForEach-Object { $_ -replace "$esc\[[0-9;]*m", '' }
$url = $null
foreach ($label in 'Production URL', 'Website URL', 'Deployed to production URL') {
  $hit = $plain | Select-String -Pattern "$label\s*:?\s*(https://\S+)" | Select-Object -Last 1
  if ($hit) { $url = $hit.Matches[0].Groups[1].Value; break }
}
if (-not $url) {
  $hit = $plain | Select-String -Pattern '(https://[a-z0-9.-]+\.netlify\.app)\b' | Select-Object -Last 1
  if ($hit) { $url = $hit.Matches[0].Groups[1].Value }
}
Write-Host ''
if ($url) { Write-Host "deployed: $url" -ForegroundColor Green } else { Write-Host 'deployed (the CLI did not print a URL - check the Netlify dashboard)' -ForegroundColor Green }
