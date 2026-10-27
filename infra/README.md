# Going live on AWS: the runbook (decision D18)

One small server in London runs the shop, its jobs and its database. Children's pictures sit in a
private S3 bucket in London, locked with our own keys. This page takes you from an empty AWS
account to a working site, one step at a time. Budget an afternoon for the first run.

> **Don't open the doors to real families until the launch gates are closed** (LG1–LG6,
> `project-office/LAUNCH-GATES.md`): DPIA, Children's Code assessment, transfers, trust pages,
> ICO registration, Article 28 DPAs, and AI no-retention confirmed.

## What you're setting up

| Piece | What it is | Where it's defined |
|---|---|---|
| The box | AWS Lightsail, London, Ubuntu 24.04, 2 GB. Runs the app, the jobs and Postgres | `infra/lightsail/` |
| Front door | Caddy: HTTPS certificate (renews itself), security headers. Job routes are shut to the internet | `infra/lightsail/Caddyfile` |
| Database | Postgres 16 on the box, reachable only from the box. The app's login can read and write rows, nothing more | `infra/lightsail/db-grants.sql` |
| Jobs | systemd timers (below). One small runner calls each job | `scripts/jobs/core.mjs` |
| Pictures | Private S3 bucket: no public access, HTTPS only, KMS-encrypted, deleted versions gone after 7 days | `infra/aws/snickerdoodle.yaml` |
| Keys | Two KMS keys: one only for originals, one for everything else. Only the app can use them, so not even you can open a child's picture from the AWS console. That's on purpose | same |
| Backups | Nightly database dump, encrypted to a key only you hold, kept 13 days. Plus Lightsail's automatic snapshots, kept 7 days | `infra/lightsail/backup-db.sh` |
| Settings | AWS Parameter Store (free). Copied to root-only files on the box | `infra/aws/put-secrets.sh`, `infra/lightsail/fetch-secrets.sh` |

### When the jobs run

| Job | When (UK time) | What it does |
|---|---|---|
| fulfilment | every 5 minutes | renders paid orders, sends them to the printer, picks up tracking |
| retention | daily 03:10 | deletes what the retention schedule says must go |
| popularity | daily 03:40 | re-ranks the range by sales (product counts only) |
| prodigi-sync | daily 04:05 | checks every product we sell still exists at the printer |
| reminders | daily 09:05 | occasion reminders, for parents who asked for them |
| database backup | daily 02:30 | the nightly encrypted dump |

The schedule lives in one place, `scripts/jobs/core.mjs`. Each deploy writes the timers from it.
`npm run jobs -- --list` shows it.

Why systemd timers and not a job queue (pg-boss): nothing extra to run or watch. A daily job missed
while the box was off runs once it's back. A job never overlaps itself. `systemctl list-timers`
shows when each last ran and when it runs next. A failure triggers an alert.

## What it costs (rough, before real traffic)

Check these in the [AWS pricing calculator](https://calculator.aws/) for London before you commit.

| Item | Per month |
|---|---|
| Lightsail 2 GB box (includes 60 GB disk, static IP, 3 TB transfer) | $12 |
| Lightsail automatic snapshots (7 kept) | $1–3 |
| Two KMS keys | $2 (each yearly key rotation adds $1 per key for the first two years, so this tops out at $6) |
| S3 storage, London, about 20 GB | about $0.50 |
| Picture moderation (Rekognition) | about $1 per 1,000 uploads |
| Parameter Store, CloudFormation, IAM | free |
| SES email, if you choose it (D7) | $0.10 per 1,000 emails |
| **Total at launch** | **about $16–18 (£12–14)** |

That's a little over D18's £10–12 estimate. The two KMS keys account for most of the gap.

## Before you start

- An AWS account with MFA on the root login. Sign in day to day as an admin user (IAM Identity
  Center or an IAM user with MFA), never as root.
- In the AWS console, switch the region (top right) to **Europe (London) eu-west-2**. Everything
  below happens there.
- Access to the domain's DNS settings.
- A password manager. You'll save two things in it: the backup key and the app's access key.

## Step 1: create the AWS pieces (10 minutes)

1. AWS console → **CloudFormation** → **Create stack** → **With new resources** → **Upload a
   template file** → choose `infra/aws/snickerdoodle.yaml`.
2. Stack name `snickerdoodle`. Leave `SiteDomain` as `snickerdoodle.co.uk`. Leave `SesFromDomain`
   blank unless you've chosen SES for email.
3. Next, next. Tick **I acknowledge that AWS CloudFormation might create IAM resources with custom
   names**. Then **Submit**.
4. Wait for `CREATE_COMPLETE`. The **Outputs** tab lists the bucket names and key ARNs. The stack
   also saved them as settings, so you don't need to copy them anywhere.

It refuses to run outside London. Buckets and keys are kept even if the stack is deleted, so a
slip can't wipe pictures.

## Step 2: the app's access key (5 minutes)

Lightsail boxes can't use IAM roles, so the app gets an access key.

1. **IAM** → **Users** → `snickerdoodle-app` → **Security credentials** → **Create access key** →
   "Application running outside AWS".
2. Save the access key ID and secret in your password manager. You'll paste them into the box in
   step 6. Never put them in email, chat or the repo.

## Step 3: create the box (10 minutes)

1. **Lightsail** → **Create instance**. Location **London (eu-west-2)**. Platform Linux, blueprint
   **OS only → Ubuntu 24.04 LTS**. Plan **2 GB RAM**. Name it `snickerdoodle`.
2. **Networking** tab: **Create static IP** and attach it to the instance.
3. **Networking** → IPv4 firewall: allow **SSH (22)**, **HTTP (80)** and **HTTPS (443)**, and
   delete anything else. For SSH, tick "Restrict to IP address", add your home IP, and tick
   **Allow Lightsail browser SSH**.
4. **Snapshots** tab: turn on **Automatic snapshots**, at 03:00 UTC. Lightsail keeps the 7 most
   recent automatic snapshots. **Never keep a manual snapshot longer than 14 days.** It would hold
   a copy of the database past the erasure promise.

## Step 4: point the domain at it

At your DNS provider, add an **A** record for `snickerdoodle.co.uk` and one for
`www.snickerdoodle.co.uk`, both pointing at the static IP. The HTTPS certificate can't be issued
until these resolve. That usually takes minutes, but can take hours.

## Step 5: set up the box (20 minutes)

Open the browser SSH (Lightsail → your instance → **Connect using SSH**) and paste these lines
one at a time.

1. Make a read-only key for the box to fetch the code with:

   ```
   sudo ssh-keygen -t ed25519 -N '' -C snickerdoodle-box -f /root/.ssh/snickerdoodle_deploy
   sudo cat /root/.ssh/snickerdoodle_deploy.pub
   ```

   In GitHub, open the repository → **Settings** → **Deploy keys** → **Add deploy key**. Paste
   it in and leave "Allow write access" **unticked**.

2. Fetch the code (swap in the real GitHub owner/repo):

   ```
   sudo apt-get install -y git
   sudo git clone -c core.sshCommand='ssh -i /root/.ssh/snickerdoodle_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new' \
     git@github.com:OWNER/REPO.git /opt/snickerdoodle/src
   ```

3. Run the setup. It's safe to run again whenever you like:

   ```
   sudo /opt/snickerdoodle/src/infra/lightsail/setup.sh
   ```

   It installs Node 22, Postgres 16, Caddy, the AWS command line, automatic security updates
   (with a reboot at 04:45 UTC if one is needed), the firewall and fail2ban. It also creates the
   two database logins and installs the services. The database passwords are made on the box and
   never leave it.

## Step 6: the backup key, and the settings (15 minutes)

1. **The backup key.** On the box, run:

   ```
   age-keygen
   ```

   It prints a **secret** line (`AGE-SECRET-KEY-1…`) and a **public key** (`age1…`). Save both
   in your password manager now. Nothing is saved on the box. The box only ever gets the public
   half, so it can lock backups but can't open them. Without the secret half, a backup can't be
   restored, so look after it.

2. **The settings.** In the AWS console, open **CloudShell** (the `>_` icon, top bar, London
   region). Choose **Actions → Upload file** and pick `infra/aws/put-secrets.sh`, then run:

   ```
   bash put-secrets.sh
   ```

   It makes `AUTH_SECRET` and `JOBS_SECRET` for you. Then it asks for the site address, the email
   settings, the Stripe and Prodigi keys, the backup **public** key, and an optional Slack or
   Discord webhook for alerts. Secret answers don't show as you type. To change a setting later,
   edit it in **Systems Manager → Parameter Store** under `/snickerdoodle/prod/`, or run the script
   again.

3. **Give the box its key and settings.** Back on the box:

   ```
   sudo aws configure --profile snickerdoodle
   ```

   Paste the access key ID and secret from step 2. Region `eu-west-2`, output `json`. Then:

   ```
   sudo sd-fetch-secrets
   ```

   It lists the setting names it found (never the values) and tells you if anything's missing.

## Step 7: deploy (15 minutes the first time)

```
sudo /opt/snickerdoodle/src/infra/lightsail/deploy.sh main
```

It builds the new version next to the old one, runs the database migrations, switches over and
checks the app answers. If the new version doesn't answer, it switches back by itself. The first
time only, load the product catalogue:

```
sudo sd-job --once seed-catalogue
```

Two one-off jobs from **your own computer** (in your copy of the repo), through an SSH tunnel
to the box's database. Open the tunnel in one terminal and leave it running:

```
ssh -N -L 5433:localhost:5432 ubuntu@<box-ip>
```

Then, in another terminal. The password is in `/etc/snickerdoodle/migrate.env` on the box
(`sudo cat /etc/snickerdoodle/migrate.env`). Don't save it anywhere else:

```
export DATABASE_URL=postgres://sd_migrator:<password>@localhost:5433/snickerdoodle
npx tsx scripts/make-admin.ts you@example.com        # you become the content reviewer
node scripts/discount-headroom.mjs --write-costs      # what each product costs you
```

- **make-admin:** sign in on the site once first (it needs your account to exist). Afterwards,
  open `/admin/review` and set up two-step login on that first visit.
- **discount-headroom:** without this, every discount and referral code gives £0 off. The
  margin guard never discounts a product whose cost it doesn't know. It reads the Prodigi cost
  sheets in `.prodigi-assets/pricing/`, which is why it runs on your computer. Re-run it
  whenever prices or Prodigi costs change.

In Stripe, point the webhook at `https://snickerdoodle.co.uk/api/webhooks/stripe` (its signing
secret is `STRIPE_WEBHOOK_SECRET` from step 6).

## Step 8: check it

- [ ] `https://snickerdoodle.co.uk` opens with a padlock, and `http://` redirects to it.
- [ ] `curl -sI https://snickerdoodle.co.uk | grep -i strict-transport` shows the HSTS header.
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://snickerdoodle.co.uk/api/jobs/retention`
      prints **404**. The jobs can't be reached from outside.
- [ ] `systemctl list-timers 'snickerdoodle-*'` lists five job timers and the backup timer.
- [ ] `sudo sd-job --once retention` ends with a line containing `"event":"ok"`.
- [ ] `sudo systemctl start snickerdoodle-backup` then
      `sudo journalctl -u snickerdoodle-backup -n 5` shows `backup-ok`.
- [ ] Upload a brand-safe test drawing. In the S3 console, the object under `…/original` shows
      encryption **SSE-KMS** with the originals key. You can see the file listed but can't open it.
      That's right.
- [ ] Opening that object's plain S3 URL in a browser gives **AccessDenied**.
- [ ] Do a practice restore (below) **before launch**, while there's nothing to lose, so the
      first real one isn't your first.

## Day to day

| To… | Run (on the box) |
|---|---|
| Deploy the latest `main` | `sudo /opt/snickerdoodle/src/infra/lightsail/deploy.sh main` |
| Deploy a tag or commit | `sudo /opt/snickerdoodle/src/infra/lightsail/deploy.sh v1.2.0` |
| Use a changed setting | `sudo sd-fetch-secrets --restart` |
| See the app's log | `sudo journalctl -u snickerdoodle-app -n 100` (add `-f` to follow) |
| See a job's last runs | `sudo journalctl -u snickerdoodle-job@retention -n 20` |
| When jobs ran / run next | `systemctl list-timers 'snickerdoodle-*'` |
| Run a job now | `sudo sd-job --once reminders` |
| Re-run the box setup | `sudo /opt/snickerdoodle/src/infra/lightsail/setup.sh` |

**Alerts.** If the app, a job, the backup or Caddy fails, the webhook you gave in step 6 gets a
message saying which one and the command to see why. It never includes log contents. With no
webhook set, the failure is only in the system log.

**Updates.** Ubuntu, Node, Postgres and Caddy security fixes install themselves overnight. The
AWS command line updates itself. Run `npm audit` on your own machine now and then, and deploy.

**Time zones.** The box runs on UTC. The job and backup times above are UK time, and they follow
the clocks changing.

## If you need to restore

**From last night's backup** (the database broke, or a bad change needs undoing):

1. Put the backup key's **secret** half into a root-only file on the box:
   `sudo install -m 600 /dev/stdin /root/backup-key.txt`, paste the `AGE-SECRET-KEY-1…` line,
   press Enter, then Ctrl+D.
2. `sudo sd-restore list` shows the backups, newest last.
3. `sudo sd-restore latest --identity /root/backup-key.txt`, or name a backup instead of `latest`.

It takes the site offline, restores into a fresh database, swaps it in, and re-applies the
least-privilege grants. Then it **replays every deletion made since the backup was taken**
(`reapply-erasures`, from the erasure ledger), so nothing a parent deleted comes back. The site
only reopens if that replay is clean. If some entries fail, it stays offline and tells you the
command to re-run once they're fixed. Afterwards: `sudo shred -u /root/backup-key.txt`.

Edits made since the backup (a corrected name, say) can't be replayed. Tell the affected parents.

**From a Lightsail snapshot** (the whole box is lost):

1. Lightsail → **Snapshots** → pick one → **Create new instance** (London, 2 GB). Move the static
   IP to the new instance.
2. On the new box, replay the deletions made since the snapshot (its time is on the Snapshots
   page, in UTC):

   ```
   sudo sd-restore --replay-only --since 2026-10-27T03:00:00Z
   ```

3. Delete the old instance once you're happy.

The full erasure-and-backups policy is in `project-office/ops/BACKUPS-AND-ERASURE.md`.

## Where every copy lives, and for how long

| Copy | Kept for | Why it's within the promise |
|---|---|---|
| Pictures (live) | until the retention job or a parent deletes them | the retention schedule, enforced in code |
| A deleted picture's old S3 version | 7 days | bucket lifecycle |
| Erasure ledger (ids only) | 30 days | longer than any backup, so restores can replay it |
| Nightly database dumps (no pictures) | 13 days | backups-bucket lifecycle |
| Lightsail automatic snapshots (database, no pictures) | 7 days | Lightsail keeps 7 |
| Pictures on the box's disk | never stored | the app streams them to and from S3 only |

## Not yet tested against real AWS

All of this was written and checked without access to an AWS account. Checked here: the template
passes `cfn-lint`. The scripts pass `shellcheck`. The systemd units and timers pass
`systemd-analyze`. Against a local Postgres, the grants, a migration run as `sd_migrator`, the full
test suite run as `sd_app`, and the dump → encrypt → decrypt → restore round trip all work. **Not
yet run for real:**

- the CloudFormation stack itself, especially the key policies and the bucket policy's encryption
  rules. The upload check in step 8 is what proves them.
- `setup.sh` and `deploy.sh` on a real Lightsail box. Watch the first `next build` on 2 GB; the
  setup adds 2 GB of swap for it.
- the Caddyfile (`caddy validate` runs on every deploy, before anything is switched).
- the Netlify scheduled functions on the test site.
