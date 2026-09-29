# Chick&Pick MVP

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open http://localhost:3000 for the organizer workspace, /miniapp for the player preview, and /?admin=1 for accounting and commissions. Set a private organizer password on first use. The Mini App catalog is viewable without LINE; player-specific bookings require a verified LINE ID token and LIFF configuration. This archive does not include LINE credentials, passwords or payment records. The app creates local data files when needed.

Alternatively use pnpm install --frozen-lockfile and pnpm dev.

## Included

- Mobile-first home with optimized 3D illustration and bottom navigation.
- Open Play participant preview: real active bookings only, circular LINE avatars, short profiles and player-declared skill. Players explicitly opt in to showing their profile; private bookings contribute only to the count. Cancelled bookings disappear from the preview, and completed games do not become a public attendance directory.
- Separate public player Mini App view and password-protected organizer/accounting views. LINE ID tokens are verified on the server before returning a player's bookings.
- Persistent preview game bookings with server-side pricing, duplicate and capacity checks.
- Players and organizers can cancel unpaid bookings; the seat reopens and the cancelled item remains in history without entering pending income or commissions.
- Players can upload private transfer-slip images for admin review; optional Hugging Face OCR returns review-only JSON. Cash can be confirmed manually. Unapproved bookings stay pending and do not enter commission settlement.
- The organizer can save a bank destination in workspace settings for new test bookings. Each booking keeps its destination when settings change. This does not verify bank deposits or enable public payments.
- Hourly coaching and courses, enrollment, lesson scheduling and payment recording.
- Password-protected admin ledger, income/expense dashboard and CSV export.
- Independent game/coaching platform rates, gross-sales or after-cost basis, estimated processing fees, linked costs, frozen settlement snapshots and payout limits.
- DUPR integration adapter is staged; profile integration is deferred. Partner credentials are not included.

## Validate

```sh
npm run lint
node --import tsx --test server/*.test.ts src/*.test.ts
npm run build
```

## MVP limitations / next priorities

This is a local development prototype. Bookings and payment confirmations do not charge or transfer real money. Production APIs intentionally remain disabled pending production integration.

1. Configure a LINE Login channel and LIFF ID on an HTTPS endpoint. Add organizer/coach roles and ownership checks; the single local organizer password and coaching demo access are not a production identity system.
2. Replace JSON storage with a transactional database and private durable receipt storage; add bank reconciliation, backups and retry handling. Receipt approval stays manual until a verified bank integration exists.
3. Define paid-booking refunds and settlement reversal/correction workflows, coach availability and course expiry. Unpaid bookings can now be cancelled, but they do not expire automatically.
4. Separate estimated fees from actual provider fees and reconcile platform operating expenses before treating any displayed share as profit.
5. Finish mobile browser acceptance testing and operational monitoring before public launch.

Revenue settings start with an unconfirmed example of 25% after costs. Save the desired game and coaching rules before closing a settlement. Linked pending costs are reserved before splitting revenue. Closed settlements retain their original rule; payout entries do not perform bank transfers. Costs entered only as organizer estimates are not automatically posted to the ledger: record and link actual costs before settlement.

See README-LINE-WORKSPACE.md, README-OCR.md, README-COACHING.md and README-ADMIN-DUPR.md for module details. The active application starts from server.marketplace.ts and src/main.tsx; server.ts and src/App.tsx are legacy source files.

For an isolated sample without touching `data/`, set `APP_DATA_DIR` to a separate local directory. The sample preview used during development lives in ignored `.preview-data/`.

For a from-scratch hosted pilot plan, see [PRODUCTION-START-HERE.md](PRODUCTION-START-HERE.md). Do not expose the current prototype publicly for bookings until its production readiness items are complete.
