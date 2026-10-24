# AWS London — the runbook (decision D18; kit in `infra/aws-london/`)

*Written 2026-10-22 for the founder. **Nothing in here has been provisioned.** No AWS account has
been touched; every step below is yours to run, in order.*

**🔑 = needs your AWS account** (the console, or AWS CloudShell, which is the console's built-in
terminal). **🖥️ = on your computer.** **📦 = on the box** (over SSH).

> **Before any real child's picture:** the launch gates still apply (LG3 transfers, LG6 content
> safety live). Until they're green the box can run as a password-locked copy
> (`SITE_MODE=test`, §3.6), test drawings only, like the Netlify test site today.

---

## 1. What you're building

```
          snickerdoodle.co.uk (DNS → one static IP)
                        │ HTTPS (Let's Encrypt, automatic)
┌─ Lightsail box, London (eu-west-2), Ubuntu 24.04 ─────────────────────┐
│  caddy ──► app (Next.js, non-root, read-only disk) ◄── scheduler (cron)│
│              │            ▲                                            │
│              │            └ settings from SSM Parameter Store, in RAM  │
│        [db container — only if you choose Postgres on the box]         │
└──────────────┼─────────────────────────────────────────────────────────┘
               ├──► Postgres: Lightsail managed database (recommended), London
               ├──► S3 "pictures" bucket — private, versioned, 2 KMS keys (originals separate)
               ├──► Rekognition (eu-west-2) — once the real moderation is wired (LG6)
               └──► S3 "db-backups" bucket — nightly encrypted dumps, 14 days
```

- **Children's pictures are only ever in the private S3 bucket.** The box's disk never holds one:
  the app's filesystem is read-only and its scratch space is in memory. So box snapshots and logs
  never contain a picture.
- **Images:** you build on your computer (Docker Desktop, Linux build) and push to a private ECR
  repository in London; the box pulls from there. No secrets are in the image.
- **Settings and secrets:** one place, SSM Parameter Store (`/snickerdoodle/prod/…`). The box reads
  them into memory at boot and on every deploy. Nothing secret is in git or in a file on disk —
  except one thing: the box's own AWS key (Lightsail can't use IAM roles), see §3.5.

## 2. Decide first

### 2.1 The database — recommendation: the Lightsail managed database

The kit supports both. Switch with one line in `/etc/snickerdoodle/box.env` (`COMPOSE_PROFILES`).

| | **Lightsail managed Postgres** (recommended) | **Postgres on the box** (D18 as written) |
|---|---|---|
| Extra cost | ~$15/month (~£12), smallest Standard plan | £0 |
| Backups | automatic daily + **point-in-time restore to any second in the last 7 days**, plus our nightly dump (14 days) | our nightly dump only — you can lose up to a day of orders if the disk dies |
| Matches BACKUPS-AND-ERASURE.md §2 ("managed Postgres with point-in-time recovery") | yes (7-day window, inside the 14-day promise) | no — the doc would need changing to "nightly dumps" |
| Patching Postgres | AWS does minor versions | you do (pull a new image) |
| The box | holds **no customer data** → rebuildable in 30 minutes, no snapshots needed, deploys can't hurt data | holds the database → needs Lightsail snapshots, careful disk monitoring, never "just rebuild it" |
| CPU/RAM | doesn't compete with mockup rendering | shares the box with the app |

**Why I recommend it:** for £12 a month you lose the one thing that can really hurt a solo
operator (a dead disk taking a day of orders with it), you get the point-in-time recovery the
backups doc already promises, and the box becomes disposable. That's a change from D18's "Postgres
on the same box" — **your call**; if you'd rather keep £0, set `COMPOSE_PROFILES=local-db` and
everything below still works (I've marked the steps that differ).

### 2.2 The box size

The hosting brief recommends **compute-optimised, 4 vCPU / 8 GB** (mockup rendering is CPU work).
The kit's defaults suit that size. To start smaller (general-purpose 4 GB, say), set in
`/etc/snickerdoodle/box.env`: `APP_MEM_LIMIT=2500m`, `APP_CPUS=1.8`, `APP_NODE_HEAP_MB=1280`. A
Lightsail box can be resized later by snapshot → new bigger box (§9). The image is built on your
computer, so even a small box never has to build anything.

### 2.3 Logs in CloudWatch — recommendation: yes

Costs pennies (§8) and gives you email alerts when a job fails (§7). Without it, logs stay on the
box (rotated) and you only get alerts for downtime, deploys and backups.

## 3. Provision (one-off) — all 🔑

Use **AWS CloudShell** (console → the `>_` icon top right) with the region set to **Europe
(London) eu-west-2**. It's already logged in as you. Upload the kit once: on your computer
right-click the repo's `infra` folder → *Compress to ZIP*; in CloudShell *Actions → Upload file*;
then `unzip -o infra.zip`. All commands below run from that folder's parent.

### 3.1 Account safety (once per AWS account)

1. 🔑 **MFA on the root user**, and do day-to-day work as a separate admin user/SSO login with MFA.
2. 🔑 **Billing:** *Billing → Budgets → Create budget → Monthly cost*, e.g. £100, email alerts at 80%
   and 100%. (Sets a ceiling on surprises.)
3. 🔑 **AI-services opt-out (DPIA A-08, required before any child image reaches Rekognition):**
   *AWS Organizations → Policies → AI services opt-out policies → enable* and attach a policy that
   opts out of all services (`"services": {"default": {"opt_out_policy": {"@@assign": "optOut"}}}`).
   Record the evidence in the sub-processor register.
4. 🔑 **CloudTrail:** the default 90-day event history is on already and free; nothing to do.

### 3.2 Two KMS keys (D2: originals have their own)

```bash
ACCT=$(aws sts get-caller-identity --query Account --output text)
GEN=$(aws kms create-key --description "snickerdoodle general (derivatives, ledger, backups)" --query KeyMetadata.Arn --output text)
aws kms create-alias --alias-name alias/snickerdoodle-general --target-key-id "$GEN"
aws kms enable-key-rotation --key-id "$GEN"
ORIG=$(aws kms create-key --description "snickerdoodle ORIGINALS (children's uploads)" --query KeyMetadata.Arn --output text)
aws kms create-alias --alias-name alias/snickerdoodle-originals --target-key-id "$ORIG"
aws kms enable-key-rotation --key-id "$ORIG"
echo "general:   $GEN"; echo "originals: $ORIG"     # keep these two ARNs for the next steps
```

### 3.3 The pictures bucket (private, versioned, encrypted, TLS-only) + direct-upload CORS

```bash
PICS=snickerdoodle-pictures-$ACCT
aws s3api create-bucket --bucket "$PICS" --create-bucket-configuration LocationConstraint=eu-west-2
aws s3api put-public-access-block --bucket "$PICS" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$PICS" --versioning-configuration Status=Enabled
sed "s|GENERAL_KEY_ARN|$GEN|" infra/aws-london/s3/pictures-default-encryption.json > /tmp/enc.json
aws s3api put-bucket-encryption --bucket "$PICS" --server-side-encryption-configuration file:///tmp/enc.json
sed -e "s|PICTURES_BUCKET|$PICS|g" -e "s|ORIGINALS_KEY_ARN|$ORIG|" infra/aws-london/s3/pictures-bucket-policy.json > /tmp/pol.json
aws s3api put-bucket-policy --bucket "$PICS" --policy file:///tmp/pol.json
aws s3api put-bucket-lifecycle-configuration --bucket "$PICS" --lifecycle-configuration file://infra/s3-lifecycle.json
aws s3api put-bucket-cors --bucket "$PICS" --cors-configuration file://infra/aws-london/s3/cors.json
```

What that gives you, in plain words:
- **nobody on the internet can read it** (Block Public Access; the app hands out 2-minute signed links only);
- **plain-HTTP requests are refused**; anything stored is KMS-encrypted (the app picks the
  originals key for originals; the bucket's default covers everything else);
- an upload into `quarantine/` that isn't encrypted with the **originals** key is refused;
- **deleted files are really gone within 7 days** (versions), unchecked uploads within 1 day, the
  erasure ledger after 30 days (BACKUPS-AND-ERASURE.md §1);
- **CORS:** the browser may only `PUT` (direct uploads, ops/DIRECT-UPLOADS.md), only from
  `https://snickerdoodle.co.uk` and `https://www.snickerdoodle.co.uk`. Add another origin (a
  staging domain) by editing `s3/cors.json` and re-running the last line — it replaces the whole
  CORS set.

*(Optional, A-03: S3 server access logging to a separate log bucket. Small cost; turn on if the
DP professional asks for it.)*

### 3.4 The backups bucket (14 days, then gone)

```bash
BAK=snickerdoodle-db-backups-$ACCT
aws s3api create-bucket --bucket "$BAK" --create-bucket-configuration LocationConstraint=eu-west-2
aws s3api put-public-access-block --bucket "$BAK" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$BAK" --versioning-configuration Status=Enabled
sed "s|GENERAL_KEY_ARN|$GEN|" infra/aws-london/s3/backups-default-encryption.json > /tmp/enc.json
aws s3api put-bucket-encryption --bucket "$BAK" --server-side-encryption-configuration file:///tmp/enc.json
sed "s|BACKUP_BUCKET|$BAK|g" infra/aws-london/s3/backups-bucket-policy.json > /tmp/pol.json
aws s3api put-bucket-policy --bucket "$BAK" --policy file:///tmp/pol.json
aws s3api put-bucket-lifecycle-configuration --bucket "$BAK" --lifecycle-configuration file://infra/aws-london/s3/backups-lifecycle.json
```

### 3.5 ECR (where images live) + three least-privilege IAM users

```bash
aws ecr create-repository --repository-name snickerdoodle --image-tag-mutability IMMUTABLE \
  --image-scanning-configuration scanOnPush=true
aws ecr put-lifecycle-policy --repository-name snickerdoodle --lifecycle-policy-text \
  '{"rules":[{"rulePriority":1,"description":"keep the last 10 images","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":10},"action":{"type":"expire"}}]}'
aws sns create-topic --name snickerdoodle-alerts      # used in 3.7

fill() { sed -e "s|ACCOUNT_ID|$ACCT|g" -e "s|PICTURES_BUCKET|$PICS|g" -e "s|BACKUP_BUCKET|$BAK|g" \
             -e "s|GENERAL_KEY_ARN|$GEN|g" -e "s|ORIGINALS_KEY_ARN|$ORIG|g" "$1"; }
for u in app box builder; do
  aws iam create-user --user-name snickerdoodle-$u
  fill infra/aws-london/iam/$u-user-policy.json > /tmp/p.json
  aws iam put-user-policy --user-name snickerdoodle-$u --policy-name snickerdoodle-$u --policy-document file:///tmp/p.json
done
```

| User | Can do | Its key lives |
|---|---|---|
| `snickerdoodle-app` | read/write/delete the **pictures bucket**, use both keys (only via S3), Rekognition in London only | in SSM (next step) — the app reads it |
| `snickerdoodle-box` | read `/snickerdoodle/prod/*` settings, pull the image, **write and read** backups (never delete), send alert emails, ship logs | `/root/.aws/credentials` on the box (§4.3) |
| `snickerdoodle-builder` | push images to the one ECR repository | your computer (`aws configure --profile snickerdoodle-builder`) |

Why three: the app never gets to read every setting or delete backups; the box never gets the
pictures; your computer can only push code. Rotate the app and box keys every 90 days (§9).

### 3.6 The settings, in SSM Parameter Store

The full list, with which are secret, is **`infra/aws-london/env/app.env.template`**. Every value is
created straight into SSM, so secrets are never on screen:

```bash
P=/snickerdoodle/prod
put()  { aws ssm put-parameter --name "$P/$1" --type String       --value "$2" --overwrite >/dev/null; }
sput() { aws ssm put-parameter --name "$P/$1" --type SecureString --value "$2" --overwrite >/dev/null; }

sput AUTH_SECRET "$(openssl rand -base64 32)"
sput JOBS_SECRET "$(openssl rand -base64 32)"
put  AUTH_URL https://snickerdoodle.co.uk
put  APP_URL  https://snickerdoodle.co.uk
put  S3_REGION eu-west-2
put  S3_BUCKET "$PICS"
put  S3_KMS_KEY_ALIAS "$GEN"                 # the key ARN (the bucket rule compares ARNs)
put  S3_KMS_KEY_ALIAS_ORIGINALS "$ORIG"
put  POD_MODE SANDBOX
put  PRODIGI_BASE_URL https://api.sandbox.prodigi.com/v4.0
put  MAIL_PROVIDER resend
put  MAIL_FROM "snickerdoodle <hello@mail.snickerdoodle.co.uk>"
put  PRIVACY_INBOX privacy@snickerdoodle.co.uk
put  CLIENT_IP_HEADER x-real-ip         # rate limits trust only the address Caddy saw

KEY=$(aws iam create-access-key --user-name snickerdoodle-app --output json)
sput S3_ACCESS_KEY "$(jq -r .AccessKey.AccessKeyId <<<"$KEY")"
sput S3_SECRET_KEY "$(jq -r .AccessKey.SecretAccessKey <<<"$KEY")"
unset KEY

# paste-in secrets from their dashboards (read -s = not shown as you type):
for k in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET PRODIGI_API_KEY RESEND_API_KEY; do
  read -rsp "$k: " v; echo; sput "$k" "$v"; unset v
done
```

- **Until the launch gates are green**, also set `put SITE_MODE test` and
  `sput TEST_SITE_PASSWORD "<a long passphrase>"` — the box then runs exactly like the test site
  (banner, password, never indexed, refuses live keys). Delete both parameters on launch day.
- **Do NOT create** `LG3_TRANSFER_ASSESSMENT_SIGNED_OFF` or `MODERATION_PROVIDER` yet, and never
  create `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE` (the box refuses to start with them).
- `S3_DIRECT_UPLOADS`: create it as `true` after the CORS rule (3.3) is in and you've done the
  check in ops/DIRECT-UPLOADS.md step 5.
- *On-box database only:* `sput LOCAL_DB_PASSWORD "$(openssl rand -hex 24)"` and
  `DATABASE_URL=postgres://snickerdoodle:<that password>@db:5432/snickerdoodle` — e.g.
  `sput DATABASE_URL "postgres://snickerdoodle:$(aws ssm get-parameter --name $P/LOCAL_DB_PASSWORD --with-decryption --query Parameter.Value --output text)@db:5432/snickerdoodle"`.

To see what's there (names only): `aws ssm get-parameters-by-path --path $P --query 'Parameters[].Name'`.

### 3.7 Alert emails

```bash
TOPIC=$(aws sns list-topics --query "Topics[?ends_with(TopicArn,':snickerdoodle-alerts')].TopicArn" --output text)
aws sns subscribe --topic-arn "$TOPIC" --protocol email --notification-endpoint you@snickerdoodle.co.uk
echo "$TOPIC"     # → ALERT_TOPIC_ARN in box.env (§4.3)
```
Click the confirmation link in the email.

### 3.8 The database (managed) 🔑 — skip if you chose Postgres on the box

Lightsail console → **Databases → Create database**:
- Location **London, Zone A (eu-west-2a)** · **PostgreSQL 16** · **Standard** (not HA) · smallest plan
- name `snickerdoodle-db`, master username `snickerdoodle`, master database name `snickerdoodle`
- leave **Public mode off** (only Lightsail boxes in London can reach it)

When it says *Available*, put its address into SSM without showing the password:

```bash
PW=$(aws lightsail get-relational-database-master-user-password --relational-database-name snickerdoodle-db --query masterUserPassword --output text)
EP=$(aws lightsail get-relational-database --relational-database-name snickerdoodle-db --query relationalDatabase.masterEndpoint.address --output text)
sput DATABASE_URL "postgres://snickerdoodle:$(jq -rn --arg p "$PW" '$p|@uri')@$EP:5432/snickerdoodle?sslmode=require"
unset PW
```
(Pick PostgreSQL 16 so the nightly dump tool matches; for 17, set `POSTGRES_IMAGE=postgres:17-bookworm` in box.env.)

### 3.9 The box 🔑

Lightsail console → **Instances → Create instance**:
- **London, Zone A** · Linux/Unix · **OS Only → Ubuntu 24.04 LTS**
- SSH key: create one and download it (keep it safe; it's your way in)
- plan: **Compute optimized → 4 vCPUs / 8 GB** (or smaller, §2.2) · name `snickerdoodle-box`
- After it starts: **Networking → Create static IP** → attach to `snickerdoodle-box`
- **Networking → IPv4 firewall:** keep SSH (22) but *Restrict to IP address* → your home IP (tick
  "allow Lightsail browser SSH"); keep HTTP (80); add **HTTPS (443)**; add **Custom UDP 443**
  (HTTP/3). Do the same on the IPv6 firewall, or turn IPv6 networking off.
- Automatic snapshots: **off** with the managed database (the box holds no customer data). **On**
  (7 days, inside the 14-day promise) if you chose Postgres on the box.

### 3.10 DNS 🔑 (at your registrar, or a free Lightsail DNS zone)

- `A  snickerdoodle.co.uk      → <static IP>`
- `A  www.snickerdoodle.co.uk  → <static IP>`
- (optional) `CAA snickerdoodle.co.uk 0 issue "letsencrypt.org"`
- **Keep** the email records you already have (Resend: the `mail.` SPF/DKIM/MX records).

Caddy asks Let's Encrypt for the certificates by itself on first start; it needs the A records to
point at the box first (allow up to an hour for DNS to spread).

## 4. First deploy

### 4.1 🖥️ Build and push the first image

Once: `aws configure --profile snickerdoodle-builder` with a key for that user
(🔑 `aws iam create-access-key --user-name snickerdoodle-builder`). Then, in the repo:

```powershell
& .\infra\aws-london\bin\build-push.ps1 -Repo <ACCT>.dkr.ecr.eu-west-2.amazonaws.com/snickerdoodle
```
It prints the tag, e.g. `20261023-0915-ab12cd3`. (On Linux/macOS/WSL: `bin/build-push.sh`.)

### 4.2 🖥️→📦 Put the kit on the box and set it up

```powershell
scp -i <your-key.pem> -r infra/aws-london ubuntu@<static IP>:/tmp/kit
ssh -i <your-key.pem> ubuntu@<static IP>
```
```bash
sudo bash /tmp/kit/bin/bootstrap-box.sh     # Docker, AWS CLI, auto security updates, systemd units
```

### 4.3 📦 The box's AWS key and its settings

🔑 In CloudShell: `aws iam create-access-key --user-name snickerdoodle-box` — it shows the key once.
On the box:
```bash
sudo -H aws configure --profile snickerdoodle-box  # paste the two values; region eu-west-2; output json
sudo chmod 600 /root/.aws/credentials
sudo nano /etc/snickerdoodle/box.env               # IMAGE_REPO, SITE_DOMAIN, ACME_EMAIL, BACKUP_BUCKET,
                                                   # BACKUP_KMS_KEY (= the general key ARN), ALERT_TOPIC_ARN,
                                                   # COMPOSE_PROFILES (empty = managed DB; local-db = on the box)
sudo /opt/snickerdoodle/kit/bin/fetch-env.sh       # "settings loaded from SSM: N" — or it says what's missing
```
Never paste the key anywhere else (chat, email, git).

### 4.4 📦 Deploy

```bash
sudo /opt/snickerdoodle/kit/bin/deploy.sh 20261023-0915-ab12cd3
```
It reads the settings, pulls the image, applies the database migrations, starts the new version
on the side and checks it (health + one mockup render), loads the catalogue, swaps it live,
checks again, then runs the smoke test. The first start also gets the HTTPS certificates.

### 4.5 📦 Make yourself the admin

Sign in on the site once (magic link), then:
```bash
sudo /opt/snickerdoodle/kit/bin/make-admin.sh you@snickerdoodle.co.uk
```
and open `/admin/review` to set up two-step login.

### 4.6 🖥️→📦 The product mockups

The mockup seeder reads the Prodigi product photos from `.prodigi-assets/` (only on your computer):
```powershell
scp -i <your-key.pem> -r .prodigi-assets ubuntu@<static IP>:/tmp/prodigi-assets
ssh -i <your-key.pem> ubuntu@<static IP> "sudo rsync -a --delete /tmp/prodigi-assets/ /opt/snickerdoodle/prodigi-assets/ && rm -rf /tmp/prodigi-assets && sudo /opt/snickerdoodle/kit/bin/job.sh seed-mockups"
```
(Takes a few minutes. Re-run whenever you add blanks.)

### 4.7 🔑 Stripe

Stripe dashboard → Developers → Webhooks → add `https://snickerdoodle.co.uk/api/webhooks/stripe`
→ copy the signing secret into SSM (`sput STRIPE_WEBHOOK_SECRET …`) →
`sudo /opt/snickerdoodle/kit/bin/deploy.sh --restart`.

### 4.8 Check it

From anywhere: `infra/aws-london/bin/smoke.sh https://snickerdoodle.co.uk` (Git Bash on Windows).
On the box (adds the mockup-render check): `sudo /opt/snickerdoodle/kit/bin/smoke.sh`.

## 5. Every day

### 5.1 Routine deploy

```powershell
& .\infra\aws-london\bin\build-push.ps1 -Repo <repo> -Box ubuntu@<static IP> -SshKey <your-key.pem>
```
Builds, pushes, and runs `deploy.sh <tag>` on the box. If anything fails **before** the swap the
live site is untouched; if the new version is unhealthy **after** the swap it rolls itself back
and emails you.

### 5.2 Change a setting

Change it in SSM (🔑 `aws ssm put-parameter … --overwrite`), then
`sudo /opt/snickerdoodle/kit/bin/deploy.sh --restart` (same image, fresh settings).

### 5.3 Roll back

```bash
sudo /opt/snickerdoodle/kit/bin/rollback.sh            # to the previous version (kept on the box: seconds)
sudo /opt/snickerdoodle/kit/bin/rollback.sh <tag>      # to an older one (pulled from ECR)
```
Rollback does **not** undo database migrations; they're additive by design, so the previous
version runs fine on the newer database. (A migration that drops something must ship *after* the
code that stops using it.)

### 5.4 When the kit itself changes (a PR touches `infra/aws-london/`)

Copy it again and re-run the bootstrap (it keeps your box.env and key):
`scp -r infra/aws-london ubuntu@<ip>:/tmp/kit` → `sudo bash /tmp/kit/bin/bootstrap-box.sh` →
`sudo /opt/snickerdoodle/kit/bin/deploy.sh --restart`.

### 5.5 Status and logs

`sudo /opt/snickerdoodle/kit/bin/logs.sh status` (what's running, live/previous version, health,
recent deploys) · `logs.sh app` · `logs.sh jobs` (the scheduled-job results) · `logs.sh caddy`.

## 6. Backups and restore (consistent with ops/BACKUPS-AND-ERASURE.md)

### 6.1 What is backed up, and what isn't

| What | How | Kept | Pictures in it? |
|---|---|---|---|
| Pictures (S3) | **not backed up** — S3's own durability + versioning | deleted versions gone in **7 days** | — |
| Database — nightly dump | `backup-db.sh` 02:30 UTC → `db-backups` bucket, KMS (general key) | **14 days**, then deleted by the bucket rule | **no** — the DB holds ids, names, emails, orders; never image bytes |
| Database — managed DB | Lightsail automatic backups + point-in-time restore | **7 days** | no |
| Box snapshots | off (managed DB) · on, 7 days (on-box DB) | 7 days | no — the box's disk never holds a picture |
| Erasure ledger | ids only, in the pictures bucket, outside the DB | 30 days | no |

So originals are **excluded** from every backup by design — crypto-shredding isn't needed
(BACKUPS-AND-ERASURE.md §1). Everything with personal data is gone within 14 days, as the privacy
notice promises.

The nightly dump emails you if it fails. Check it worked: `sudo /opt/snickerdoodle/kit/bin/restore-db.sh --list`.

### 6.2 Restore from a nightly dump (both database options)

```bash
sudo /opt/snickerdoodle/kit/bin/restore-db.sh --list
sudo /opt/snickerdoodle/kit/bin/restore-db.sh --from db/2026/10/23/snickerdoodle-20261023T023012Z.dump --yes
```
It takes the site **offline** (Caddy stopped), takes a safety dump of the current database, restores,
then **replays every erasure since the dump was taken** (`/api/jobs/reapply-erasures`). The site
comes back online **only when nothing failed**; otherwise it stays offline and tells you the
command to re-run (the replay is safe to repeat). Tell affected parents if recent *edits* were lost
(BACKUPS-AND-ERASURE.md §3).

### 6.3 Restore to a moment (managed database, point-in-time)

1. 🔑 Lightsail console → the database → **Snapshots & restore → Create new database from
   specific point in time** → pick the time → name it `snickerdoodle-db-restored`. Note the time.
2. 🔑 Put the new database's address into SSM (§3.8, with the new name).
3. 📦 `sudo /opt/snickerdoodle/kit/bin/restore-db.sh --replay-only --since 2026-10-23T09:14:00Z --yes`
   (the restore point, in UTC). Same offline → replay → online rule.
4. 🔑 When you're happy, delete the old database.

### 6.4 Practise it

Once a quarter, restore last night's dump into a **scratch** Lightsail database (or a scratch
container) and run the app against it. A backup you haven't restored is a hope, not a backup.

## 7. Logs and alerts

**Always on, no setup:** the box emails you (SNS) when a deploy fails, rolls back, or a backup
fails. Logs rotate on the box (~50 MB per service). Caddy keeps **no access log** on purpose
(request lines carry gift-link and invite tokens).

**🔑 Lightsail alarms (free):** box → *Metrics* → add alarms for **CPU > 80% for 15 min** and
**Status check failed**; database → **CPU > 80%**, **Free storage < 2 GB**. Notifications → your
email/phone.

**🔑 Is the site up? (Route 53 health check, ~$0.50/month):**
```bash
aws route53 create-health-check --caller-reference sd-$(date +%s) --health-check-config \
  '{"Type":"HTTPS_STR_MATCH","FullyQualifiedDomainName":"snickerdoodle.co.uk","ResourcePath":"/api/health","SearchString":"\"ok\":true","RequestInterval":30,"FailureThreshold":3}'
```
then CloudWatch (region **us-east-1**, where Route 53 metrics live) → *Alarms → Create* on that
health check's `HealthCheckStatus < 1` → an SNS email topic in us-east-1. (The check only
fetches `/api/health`, which carries no personal data.)

**🔑📦 CloudWatch Logs (recommended, §2.3):**
1. 🔑 `aws logs create-log-group --log-group-name /snickerdoodle/prod` and
   `aws logs put-retention-policy --log-group-name /snickerdoodle/prod --retention-in-days 30`
   (the DPIA's 30–90-day server-log intent).
2. 📦 `sudo install -D -m 644 /opt/snickerdoodle/kit/docker/aws-credentials.conf /etc/systemd/system/docker.service.d/aws-credentials.conf`
   `sudo cp /opt/snickerdoodle/kit/docker/daemon.cloudwatch.json /etc/docker/daemon.json`
   `sudo systemctl daemon-reload && sudo systemctl restart docker && sudo systemctl restart snickerdoodle`
   (If containers then refuse to start with an `awslogs` error, the box key or policy is wrong —
   copy `docker/daemon.json` back and restart to return to local logs.)
3. 🔑 One metric + alarm per line the app/scheduler writes when something needs you:

```bash
G=/snickerdoodle/prod
alarm() { # name, filter pattern, threshold, period-seconds
  aws logs put-metric-filter --log-group-name $G --filter-name "$1" --filter-pattern "$2" \
    --metric-transformations metricName="$1",metricNamespace=Snickerdoodle,metricValue=1,defaultValue=0
  aws cloudwatch put-metric-alarm --alarm-name "snickerdoodle-$1" --namespace Snickerdoodle --metric-name "$1" \
    --statistic Sum --period "$4" --evaluation-periods 1 --threshold "$3" --comparison-operator GreaterThanOrEqualToThreshold \
    --treat-missing-data notBreaching --alarm-actions "$TOPIC"
}
alarm JobFailed          '"[jobs] FAILED"'                    1 3600
alarm FulfilmentAttention '"[fulfilment] tick needs attention"' 1 900
alarm ErasureLedgerFailed '"[erasure-ledger] FAILED"'          1 300
alarm DatabaseDown       '"[health] database check failed"'   3 300
alarm RenderCheckFailed  '"[health] render check failed"'     1 3600
```
`ErasureLedgerFailed` matters most: it means a deletion wasn't written to the ledger, so a
restore could bring it back — fix the cause and note the ids from the log.

## 8. Monthly cost (estimate — confirm in the AWS Pricing Calculator)

The hosting brief (`briefs/HOSTING-speed.md`) isn't in the repo yet, so these are my own figures
at list prices in USD (≈ £0.78 per $). The Lightsail plan prices especially must be confirmed on
the Lightsail pricing page before you commit.

| Item | Assumption | $/month |
|---|---|---|
| Lightsail box, **compute-optimised 4 vCPU / 8 GB** | the brief's starting size (transfer allowance included) | **~84** (to confirm) |
| …or general-purpose 8 GB / 2 vCPU · 4 GB / 2 vCPU · 2 GB (D18's original) | if you start smaller | 44 · 24 · 12 |
| Static IP | free while attached | 0 |
| Lightsail managed Postgres, Standard, smallest | §2.1 recommendation (£0 on the box) | 15 |
| S3 pictures | 50 GB + requests | ~1.5 |
| S3 DB backups | 14 × small dumps | < 0.5 |
| KMS | 2 keys; S3 Bucket Keys keep requests in the free tier | 2 |
| ECR | ~10 images kept | ~0.5 |
| SSM Parameter Store (Standard) | | 0 |
| CloudWatch Logs + 5 alarms | a few GB/month | ~1–2 |
| Route 53 health check (+ hosted zone if DNS moves there) | | 0.5 (+0.5) |
| SNS email | | 0 |
| Rekognition (once live) | ~$0.001 per picture checked; 2,000 uploads | ~2 |
| **Total — brief's box + managed DB** | | **~$105 (~£82)** |
| Total — brief's box + Postgres on the box | | ~$90 (~£70) |
| Total — 4 GB general-purpose + managed DB | | ~$45 (~£35) |
| Total — D18's 2 GB box + Postgres on the box | | ~$20 (~£16) |

The box is most of the bill. A sensible path: start on general-purpose 4 GB with the managed DB
(~£35), watch CPU during mockup-heavy browsing (§7 alarm), and step up to compute-optimised when it
earns it (§9 resize).

## 9. Housekeeping calendar

- **Monthly:** rebuild and deploy (picks up the base image's security fixes) even with no code
  change. The box applies Ubuntu security updates itself (reboots at 03:40 UTC only when a kernel
  needs it; the app comes back on its own).
- **Every 90 days:** rotate the `snickerdoodle-app` key (create new → `sput S3_ACCESS_KEY/S3_SECRET_KEY`
  → `deploy.sh --restart` → delete the old key) and the `snickerdoodle-box` key (create new →
  `sudo -H aws configure --profile snickerdoodle-box` → delete the old).
- **Quarterly:** a restore drill (§6.4); review the AWS bill against §8.
- **Resize the box:** Lightsail snapshot → *Create new instance from snapshot* with the bigger
  plan → move the static IP to it → stop the old one. With the managed DB there's nothing else to
  move.
- **Rebuild from scratch** (managed DB): new box → §3.9 → §4.2–4.4 with the current tag. ~30 minutes.

## 10. Your steps, in order (checklist)

1. ☐ Decide: managed DB or on the box (§2.1) · box size (§2.2) · CloudWatch logs (§2.3)
2. ☐ 🔑 Account safety: root MFA, budget alert, **AI-services opt-out**, (§3.1)
3. ☐ 🔑 Two KMS keys (§3.2)
4. ☐ 🔑 Pictures bucket + CORS (§3.3) · backups bucket (§3.4)
5. ☐ 🔑 ECR repo, alert topic, three IAM users (§3.5)
6. ☐ 🔑 Settings into SSM, incl. `SITE_MODE=test` + password until the launch gates are green (§3.6)
7. ☐ 🔑 Confirm the alert email subscription (§3.7)
8. ☐ 🔑 Managed database (§3.8) → DATABASE_URL into SSM
9. ☐ 🔑 Lightsail box, static IP, firewall (§3.9)
10. ☐ 🔑 DNS A records → static IP (§3.10)
11. ☐ 🖥️ Builder profile; build + push the first image (§4.1)
12. ☐ 🖥️📦 Copy the kit, bootstrap the box (§4.2)
13. ☐ 🔑📦 Box key + box.env + `fetch-env.sh` (§4.3)
14. ☐ 📦 `deploy.sh <tag>` (§4.4)
15. ☐ 📦 Sign in once, `make-admin.sh` (§4.5)
16. ☐ 🖥️📦 Copy `.prodigi-assets`, seed mockups (§4.6)
17. ☐ 🔑 Stripe webhook → SSM → `deploy.sh --restart` (§4.7)
18. ☐ Smoke test from your computer (§4.8)
19. ☐ 🔑📦 Alerts: Lightsail alarms, Route 53 health check, CloudWatch logs + alarms (§7)
20. ☐ 🔑 Turn on direct uploads after the CORS check (`S3_DIRECT_UPLOADS=true`, ops/DIRECT-UPLOADS.md)
21. ☐ Day after: check the first nightly backup (`restore-db.sh --list`) and the jobs (`logs.sh jobs`)
22. ☐ Launch day (only when the LG gates are closed): delete `SITE_MODE` + `TEST_SITE_PASSWORD`,
    live Stripe key, `PRODIGI_BASE_URL` live + `POD_MODE=LIVE`, then `deploy.sh --restart`
