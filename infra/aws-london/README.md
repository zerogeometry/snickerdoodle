# infra/aws-london — the deploy kit for the AWS London box (D18)

One AWS Lightsail box in London runs the shop: the app, Caddy (HTTPS) and the scheduled jobs, in
Docker. Pictures stay in the private S3 bucket; Postgres is the Lightsail managed database
(recommended) or a container on the box. **Nothing here has been provisioned** — the founder's
steps are in [`project-office/ops/AWS-LONDON-RUNBOOK.md`](../../project-office/ops/AWS-LONDON-RUNBOOK.md).

| File | What it is |
|---|---|
| `Dockerfile` (+ `Dockerfile.dockerignore`) | The app image: Linux build (right sharp/resvg binaries), non-root, `next build` + `next start`. No secrets inside. |
| `docker-compose.yml` | The box: `app`, `caddy`, `scheduler`, and optional `db` (profile `local-db`). |
| `Caddyfile` | HTTPS (automatic certificates), www → bare domain, blocks `/api/jobs/*` from outside, sets the client IP header the rate limits trust. |
| `scheduler/` | The cron table (UTC) and the job runner that POSTs `/api/jobs/*` with the jobs secret. |
| `env/app.env.template` | **Every** setting the app reads, marked `[SECRET]` (SSM SecureString) or `[plain]` (SSM String). A list, never values. |
| `env/box.env.example` | The box's own non-secret settings → `/etc/snickerdoodle/box.env`. |
| `bin/build-push.ps1` / `.sh` | On your computer: build the image for linux/amd64 and push it to ECR. |
| `bin/bootstrap-box.sh` | Once, on a fresh Ubuntu 24.04 box: Docker, AWS CLI, auto security updates, systemd units. |
| `bin/deploy.sh` | Pull → migrate → check the new image on the side → swap → health-check (auto-rollback) → smoke. `--restart` reloads settings. |
| `bin/rollback.sh` | Back to the previous image (kept on the box) in seconds. |
| `bin/smoke.sh` | The post-deploy check: health, home page + security headers, http→https, jobs closed, one mockup render. |
| `bin/backup-db.sh` / `restore-db.sh` | Nightly KMS-encrypted dump to S3 (14 days), read back and fully restore-checked, with a sha256 manifest; restore only verified dumps → migrations → erasure-ledger replay, site offline until it's clean. |
| `bin/fetch-env.sh` | SSM Parameter Store → `/run/snickerdoodle` (memory only, readable by root + the app's uid). Refuses dev-only switches, `AWS_ENDPOINT_URL*` and missing essentials. |
| `bin/start.mjs` | The image's entry point: loads the settings FILE (never container env, which Docker keeps on disk), then `next start` or a script. |
| `bin/watchdog.sh` | Hourly: services, health, disk, backup age, certificate expiry, and the log lines that mean a promise to families may be broken → email. |
| `bin/logs.sh`, `bin/make-admin.sh`, `bin/up.sh` | Logs/status · admin flag (box version of `scripts/make-admin.ts`) · start at boot. |
| `bin/migrate.mjs` | Applies `src/db/migrations` with production deps only (copied into the image; run via `start.mjs`). |
| `iam/`, `s3/` | Least-privilege IAM policies and the bucket policy / CORS / lifecycle / encryption documents. |
| `systemd/`, `docker/` | Boot, nightly-backup and hourly-watchdog units; Docker log rotation, optional CloudWatch logging. |

Build locally (repo root): `docker buildx build --platform linux/amd64 -f infra/aws-london/Dockerfile -t snickerdoodle:test .`
