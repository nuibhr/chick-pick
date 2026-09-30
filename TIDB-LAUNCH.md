# Chick&Pick TiDB launch runbook

This runbook takes the tested local preview to a controlled real-user pilot.
Keep `APP_LIVE_MODE=false` until every readiness check passes.

## 1. TiDB Cloud

1. Create or use a TiDB Cloud Starter instance in a region near the app server.
2. Open **Connect**, choose the public/direct connection for Node.js, and generate a database password.
3. Save the full `mysql://...` URL as `TIDB_DATABASE_URL` in the server environment only.
4. Run `npm run db:migrate` once. The migration is idempotent.

The server enforces TLS 1.2 or newer. The migration creates:

- `app_documents` for marketplace, finance and revenue state
- `receipt_blobs` for private slip images
- `audit_events` for organizer/player actions
- `admin_credentials` and `admin_sessions` for durable admin access

## 2. LINE Login and LIFF

Create a LINE Login channel and LIFF app after the HTTPS app URL is known.
Use `/miniapp` as the LIFF endpoint and set these server variables:

- `LINE_CHANNEL_ID`
- `VITE_LIFF_ID`

No channel secret belongs in a `VITE_` variable or in Git.

## 3. Slip OCR

Deploy `nuibhr/line-bill-scanner` as a **private** Hugging Face Docker Space.
Set the following in the Chick&Pick server environment:

- `HF_OCR_ENDPOINT_URL=https://<private-space-host>/ocr`
- `HF_OCR_TOKEN=<private read token>`

OCR is review assistance only. An organizer must compare the original image,
expected amount and recipient before approving the receipt.

## 4. First organizer login

Create a random password of at least 12 characters as `ADMIN_SETUP_TOKEN`.
Open `/admin`, choose first-time setup, and use that same value once. After the
credential is stored in TiDB, remove `ADMIN_SETUP_TOKEN` from the server environment.

## 5. Safe activation

Before enabling writes, `/api/health` should report:

```json
{
  "status": "ok",
  "mode": "safe-preview",
  "database": "tidb",
  "lineConfigured": true,
  "ocrConfigured": true
}
```

Then set `APP_LIVE_MODE=true`, redeploy, and verify `mode` is `live`.

## 6. Pilot smoke test

Use one organizer and one real LINE account:

1. Create an open-play session in `/admin`.
2. Join it from `/miniapp` and confirm a duplicate tap does not create a second seat.
3. Upload a test slip and confirm the original image is visible only after admin login.
4. Reject it once, resubmit, approve it, then approve the player for the court.
5. Confirm finance shows the settled income and the player appears in the participant preview only when profile visibility is enabled.
6. Export the finance CSV and inspect the audit history before inviting more players.

Do not enable the pilot if the database is `local-json`, LINE is unconfigured, or
the HTTPS origin differs from the registered LIFF endpoint.
