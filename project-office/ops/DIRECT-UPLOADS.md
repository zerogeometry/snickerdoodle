# Direct uploads — what the bucket needs (written 2026-10-22, for the founder)

**What changed:** a parent's drawing or photo now goes **straight from the browser to our private
bucket**, not through the app server. That removes the 6 MB (Netlify) / 4.5 MB (Vercel) request cap
and the double hop, so a big phone photo is limited only by the parent's connection
(project-office/briefs/HOSTING-speed.md §4.1). The instant on-screen preview was already local, so
it shows straight away as before.

**What did not change:** every safety gate. The bytes land in a **quarantine** area that nothing can
view, render or order. The server then re-reads them and runs the same steps as before: EXIF/GPS
strip, the CSAM hash-check on the bytes exactly as uploaded, moderation, the retention clock and the
terms record. Only then does a draft exist. The raw upload is then deleted, every stored version of
it included.

The code is switched on by one setting, **`S3_DIRECT_UPLOADS=true`**. Until the bucket's CORS rule
below is in place, leave it **unset**. Uploads then go through the server as they do today.

## How it works (one upload)
1. **Ask.** The browser asks the server to upload *N bytes*. The server checks that the terms were
   accepted and that this device is under its upload limit. Then it signs a URL that can only
   **PUT** one key, `quarantine/<random id>`. The URL is pinned to exactly *N bytes* and to the
   originals KMS key, and it can only be started in the next **5 minutes**. A matching ticket goes into an
   httpOnly cookie, so only that browser can finish the upload.
2. **Upload.** The browser PUTs the bytes to the bucket. A body of the wrong size, a different key,
   a different content type or missing encryption headers is refused by the bucket itself.
3. **Finish.** The browser asks the server to finish. The server reads the quarantined bytes and runs
   the normal ingest. The clean original goes to `assets/<id>/original` and the quarantine copy is
   deleted.
4. **Clean up.** Anything left in `quarantine/` (a closed tab, a dropped connection) is deleted by the
   daily retention job once it's an hour old. The bucket lifecycle rule is the backstop.

## To do on AWS (D18 launch bucket) — not done by the build agent
**1. CORS: allow the site to PUT.** If the bucket already has a CORS configuration, *merge* this rule
into it, because `put-bucket-cors` replaces the whole configuration:
```json
{
  "CORSRules": [
    {
      "ID": "direct-uploads",
      "AllowedOrigins": ["https://snickerdoodle.co.uk", "https://www.snickerdoodle.co.uk"],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["content-type", "x-amz-server-side-encryption", "x-amz-server-side-encryption-aws-kms-key-id"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```
`aws s3api put-bucket-cors --bucket <bucket> --cors-configuration file://cors.json`
(Only `PUT` from our own origins. No `GET` rule is needed, because pictures are shown through
signed URLs in `<img>`, which doesn't use CORS.)

**2. Lifecycle backstop.** `infra/s3-lifecycle.json` now has a `quarantine/` rule: current objects
expire after 1 day, non-current versions after 1 day. Re-apply the file as described in
BACKUPS-AND-ERASURE.md §1.

**3. Permissions for the app's credentials** (the signed URL acts with these):
`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:DeleteObjectVersion` on `quarantine/*`;
`s3:ListBucket` and `s3:ListBucketVersions` (prefix `quarantine/`); `kms:GenerateDataKey` and
`kms:Decrypt` on the **originals** key.

**4. (Optional, belt and braces) bucket policy:** refuse any `quarantine/*` PUT that isn't encrypted
with the originals key. The app already signs the header, so this only catches mistakes:
```json
{
  "Sid": "QuarantineMustUseOriginalsKey",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::<bucket>/quarantine/*",
  "Condition": { "StringNotEquals": { "s3:x-amz-server-side-encryption-aws-kms-key-id": "<originals key ARN>" } }
}
```

**5. Turn it on:** set `S3_DIRECT_UPLOADS=true`, upload one large phone photo from a phone, and
check that the draft appears. Also check that `quarantine/` is empty a minute later.

## Test site (Netlify + Supabase, D19)
Leave `S3_DIRECT_UPLOADS` **unset** for now. Two things are unconfirmed on Supabase's S3 endpoint:
whether it honours a presigned `PUT` with a signed Content-Length, and whether its CORS lets our
origin PUT. To try it, set the variable and upload a photo larger than 6 MB. If the upload fails,
unset the variable and the site goes back to uploading through the server. The finish step re-checks
the size, so a store that ignores the size pin still can't feed in more than was signed.

## Local dev
MinIO answers the CORS preflight for any origin out of the box (checked 2026-10-22), so
`.env.example` turns direct uploads on. The integration tests
(`src/server/__tests__/directUpload.int.test.ts`) run against MinIO. They cover the KMS-encrypted
path and a versioned bucket.

## Still on the old path
`keepCreation` (a signed-in "keep" that sends its own bytes) still uses the Server Action body.
No screen calls it today: signed-in parents upload as above and then keep with `keepUploadAction`.
`next.config.ts` keeps `bodySizeLimit: '20mb'` for it and for the inline fallback.
