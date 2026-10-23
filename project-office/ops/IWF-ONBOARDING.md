# IWF Image Intercept: what we need before the hash check can go live (written 2026-10-22, for the founder)

**Where things stand.** Every upload has to pass a known-CSAM hash check (decision D8, launch gate
M1) before it can reach a print order. The code now has the **slot** for IWF Image Intercept
(`src/server/moderation/iwf.ts`), but no IWF client. Onboarding isn't done, so we have no API
details and no credentials, and we have not guessed at them.

**What happens until it's wired.** With `MODERATION_PROVIDER=real`, the hash check is **closed**:
- Every upload is held for review with the label `hash-check-unavailable`. It can't be printed.
- Review can't show or clear these items, only remove them (`src/authz/review.ts`). A person
  looking could be looking at known CSAM, and clearing would skip the hash check.
- `isModerationConfigured()` stays **false**. In production that means every upload is held as
  `screening-not-configured` and **nothing is sent to Rekognition either**.
- The server logs a warning at startup: `IWF Image Intercept is not configured — the CSAM hash gate is CLOSED`.

With the default (`MODERATION_PROVIDER` unset or `stub`), local dev works as before.

---

## What to get from IWF

### 1. Agreement and roles
- [ ] The Image Intercept terms / membership agreement, signed.
- [ ] **IWF's role for our data**: processor, independent controller, or neither (hash-only)? If it's
      a processor, we need **Article 28 terms**, and IWF goes in the `sub_processors` register.
      (DPIA §5, "IWF — Image Intercept" row.)
- [ ] Any confidentiality terms on the hash list or the tool, and who on our side may handle it.

### 2. What leaves our system
This decides the privacy story, so get it **in writing**.
- [ ] Does the check run **inside our server** (a downloadable list or plug-in) or as a **hosted
      call**? We strongly prefer in-VPC. A child's image should not leave for a hash check.
- [ ] If it's a hosted call: does it send **only hashes**, or any image bytes? Where is it hosted
      (UK)? What does IWF log or keep from each query, and for how long?

### 3. The technical spec
- [ ] **Which hash types** are matched: cryptographic (which algorithms) and/or perceptual (which
      algorithms)? Does anything need a separate licence (e.g. a perceptual-hash SDK)?
- [ ] **What the input is**: the original file bytes, or decoded pixels? Today we hand the check the
      bytes **exactly as uploaded**, before the EXIF strip and re-encode. We don't keep those bytes
      after ingest, so a later re-check only has our re-encoded copy. Ask whether that matters.
- [ ] **How to call it**: endpoint or package, auth method and credential format, how keys rotate.
- [ ] **Response format**: how a match and a no-match look, plus any match metadata (category, an
      IWF reference) and what we may store.
- [ ] **Failure modes**: rate limits, timeouts, expected latency, uptime, error codes, maintenance
      windows. Every failure keeps our gate closed, so this decides how often uploads get stuck.
- [ ] If it's a list we hold: how it's updated (cadence, signing, integrity check), and whether new
      entries must be checked against images we already stored.

### 4. Test fixtures
- [ ] **IWF-provided safe test hashes or test files that trigger a match.** These must never be real
      material. Without them we can't write an integration test that proves a match blocks.

### 5. What happens on a match
This goes in the illegal-content runbook (DPIA A-11, OQ-3, OQ-6) and needs DP sign-off.
- [ ] Who we report to (IWF and/or NCA-CEOP), how, and how quickly.
- [ ] What to preserve, for how long, and how (we already keep BLOCKED items out of view, out of
      orders and out of the retention purge).
- [ ] Whether and how to restrict the uploader's account, and what (if anything) we tell them.

### 6. People
- [ ] A technical contact and an incident contact at IWF.

---

## What we do once IWF sends the spec
1. Implement `IwfImageInterceptAdapter` in `src/server/moderation/iwf.ts` (`resolveIwfAdapter`),
   built from **secret-store** config. Missing config becomes a startup error, like Rekognition's.
   The adapter must return exactly `{ match: true }` or `{ match: false }`. Anything else keeps the gate closed.
2. Add an integration test using IWF's test fixtures: a match is **BLOCKED**, preserved and audited.
3. `isModerationConfigured()` then turns true under `MODERATION_PROVIDER=real`.
4. Decide what to do about uploads held as `hash-check-unavailable` during an IWF outage. Today the
   family keeps the picture in their keepsake box but can't print it, and they can upload it again.

## Before `MODERATION_PROVIDER=real` is switched on anywhere real
All of these must be true. None of them is a code switch.
- [ ] **LG3 + LG6 green** (`project-office/LAUNCH-GATES.md`).
- [ ] The **AWS DPA covers Rekognition**, recorded in the `sub_processors` register.
- [ ] The **AWS Organizations AI-services opt-out policy** is applied for Rekognition, with the
      evidence recorded (DPIA A-08, OQ-19). Without it, AWS may keep and use the images to
      improve its service.
- [ ] The app's AWS credentials can call **only** `rekognition:DetectModerationLabels` and
      `rekognition:DetectText`, with the condition `aws:RequestedRegion = eu-west-2`. They live in
      the secret store or the box's environment, never in git. The region is also pinned in code,
      and a Rekognition endpoint override is refused at startup.
- [ ] The founder has confirmed the threshold and labels in `src/server/moderation/config.ts`.
- [ ] The IWF adapter is wired (above).
