# Builds the app image ON LINUX (Docker Desktop builds linux/amd64 even on Windows, so sharp and
# resvg get their Linux binaries) and pushes it to the private ECR repository in London.
# Run from anywhere in the repo, on YOUR computer (needs Docker Desktop + the AWS CLI, logged in
# with the `snickerdoodle-builder` profile — runbook §3.5):
#
#   & .\infra\aws-london\bin\build-push.ps1 -Repo 123456789012.dkr.ecr.eu-west-2.amazonaws.com/snickerdoodle
#   & .\infra\aws-london\bin\build-push.ps1 -Repo <repo> -Box ubuntu@<static ip>    # …and deploy it
#
# The image carries no secrets (.env* is excluded by Dockerfile.dockerignore); settings come from
# SSM on the box at run time.
param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [string]$AwsProfile = 'snickerdoodle-builder',
  [string]$Box = '',
  [string]$SshKey = ''
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is not installed or not on PATH - start Docker Desktop' }
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { throw 'the AWS CLI is not installed - https://aws.amazon.com/cli/' }
if ($Repo -notmatch '^\d{12}\.dkr\.ecr\.eu-west-2\.amazonaws\.com/[a-z0-9._/-]+$') { throw "-Repo should look like 123456789012.dkr.ecr.eu-west-2.amazonaws.com/snickerdoodle" }

Push-Location $root
$prev = $ErrorActionPreference
try {
  $ErrorActionPreference = 'Continue' # native tools write progress to stderr; the exit code decides
  $sha = (& git rev-parse --short HEAD).Trim()
  $dirty = (& git status --porcelain)
  if ($dirty) { Write-Host 'note: you have uncommitted changes - they WILL be in this image' -ForegroundColor Yellow }
  $tag = "$((Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmm'))-$sha"

  $registry = $Repo.Split('/')[0]
  # through cmd's pipe: Windows PowerShell 5.1 re-encodes text piped between two programs, and ECR
  # then answers the login with "400 Bad Request"
  & cmd /c "aws ecr get-login-password --region eu-west-2 --profile $AwsProfile | docker login --username AWS --password-stdin $registry"
  if ($LASTEXITCODE -ne 0) { throw 'could not log in to ECR - check the AWS profile' }

  & docker buildx build --platform linux/amd64 -f infra/aws-london/Dockerfile `
    --build-arg "APP_BUILD=$tag" -t "${Repo}:$tag" --push .
  if ($LASTEXITCODE -ne 0) { throw 'the image build failed - scroll up for the first error' }
  Write-Host ''
  Write-Host "pushed ${Repo}:$tag" -ForegroundColor Green

  if ($Box) {
    $sshArgs = @()
    if ($SshKey) { $sshArgs += @('-i', $SshKey) }
    & ssh @sshArgs $Box "sudo /opt/snickerdoodle/kit/bin/deploy.sh $tag"
    if ($LASTEXITCODE -ne 0) { throw "the deploy on the box failed (exit $LASTEXITCODE) - the live site was left as it was unless it says it rolled back" }
  } else {
    Write-Host "deploy it with:  ssh ubuntu@<box> sudo /opt/snickerdoodle/kit/bin/deploy.sh $tag"
  }
} finally {
  $ErrorActionPreference = $prev
  Pop-Location
}
