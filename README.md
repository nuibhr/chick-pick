# Chick&Pick MVP

## Current hosted app — 8 October 2026

The Cloudflare + TiDB app uses LINE owner/staff authentication, real Open Play and coach booking APIs, and private slip review with server-side SlipOK verification. Staff can combine roles such as operator + finance; only the owner changes rates, payment settings and team access. New Stripe Checkout is retired; old Stripe records and signed webhooks remain for reconciliation. SlipOK quota is verified from the live owner UI after fixing the unsupported workerd redirect mode. The SCB optional-currency parser failure is fixed and a real 120-baht receipt is now verified through the live admin UI; funds approval remains pending for the owner. See [SCB fix and 90-test validation](SLIPOK-SCB-FIX-2026-10-08.md). A separate LINE member and valid transfer/approval test is still required. The Node preview remains a separate local backend.

See [README-SLIPOK.md](README-SLIPOK.md) for the active payment setup and limitations, [README-STRIPE.md](README-STRIPE.md) for legacy Stripe records, and [LAUNCH-REVIEW-2026-10-08.md](LAUNCH-REVIEW-2026-10-08.md) for current deployment and live interaction evidence.

Owner-configurable bank and phone PromptPay channels support separate recipients, independent visibility, booking-time snapshots, copy actions and locally generated amount-prefilled PromptPay QR images. The bank channel can use its own bank-linked PromptPay mobile for amount-prefilled QR, with an uploaded static bank QR as a legacy fallback. Verified SlipOK results appear as a summary for funds confirmation; reference and amount entry is confined to legacy manual review. QR export supports native file sharing and a five-minute QR-only HTTPS page for Safari. See [PAYMENT-CHANNELS-2026-10-08.md](PAYMENT-CHANNELS-2026-10-08.md) for channel setup, [PAYMENT-EXPERIENCE-2026-10-08.md](PAYMENT-EXPERIENCE-2026-10-08.md) for mobile limitations and [BANK-PROMPTPAY-2026-10-08.md](BANK-PROMPTPAY-2026-10-08.md) for the latest 87-test validation and bank PromptPay setup.

## Run locally

New Open Play transfer bookings now hold one seat for five minutes. Pending uploaded slips retain the seat for admin review, and expired unpaid holds release capacity without entering pending revenue. Existing bookings are preserved. See [hold rules, concurrency tests and remaining mobile check](OPEN-PLAY-HOLD-2026-10-08.md).

A post-expiry transfer slip can be submitted as evidence within 24 hours without reclaiming an already released seat. Staff must verify the original transfer time and current capacity before any manual recovery, otherwise reconcile and refund. See [late slip recovery and staging checklist](LATE-SLIP-RECOVERY-2026-10-10.md).

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
node --import tsx --test cloudflare/*.test.ts server/*.test.ts src/*.test.ts
npm run build
```

## MVP limitations / next priorities

The local development server remains a prototype. The Cloudflare app has TiDB-backed booking and manual payment-review APIs with transactional audit records. New hosted bookings use transfer slips and SlipOK; legacy Stripe records remain for reconciliation. Manual receipt approval does not move money; historical Stripe test payments do not count as real income. Payment-provider configuration and code tests do not prove a successful live payment or bank payout.

1. Complete ordinary-member mobile testing of the Published LINE MINI App and LIFF ID on HTTPS. The single local organizer password and coaching demo access belong to the Node preview, not the hosted LINE staff system.
2. Configure both receiving accounts in SlipOK and the owner payment-channel settings, then test a valid ordinary-member transfer and approval before live activation; add payment reconciliation, backups and retry monitoring. Local coaching and DUPR state still use files. Slip approval stays manual.
3. Define paid-booking refunds and settlement reversal/correction workflows, coach availability and course expiry. Unpaid bookings can now be cancelled, but they do not expire automatically.
4. Separate estimated fees from actual provider fees and reconcile platform operating expenses before treating any displayed share as profit.
5. Finish mobile browser acceptance testing and operational monitoring before public launch.

Revenue settings start with an unconfirmed example of 25% after costs. Save the desired game and coaching rules before closing a settlement. Linked pending costs are reserved before splitting revenue. Closed settlements retain their original rule; payout entries do not perform bank transfers. Costs entered only as organizer estimates are not automatically posted to the ledger: record and link actual costs before settlement.

See README-LINE-WORKSPACE.md, README-OCR.md, README-COACHING.md and README-ADMIN-DUPR.md for module details. The active application starts from server.marketplace.ts and src/main.tsx; server.ts and src/App.tsx are legacy source files.

For an isolated sample without touching `data/`, set `APP_DATA_DIR` to a separate local directory. The sample preview used during development lives in ignored `.preview-data/`.

For a from-scratch hosted pilot plan, see [PRODUCTION-START-HERE.md](PRODUCTION-START-HERE.md). For an HTTPS page to start LINE LIFF identity testing, see [README-HTTPS-LINE-SETUP.md](README-HTTPS-LINE-SETUP.md). Do not expose the current prototype publicly for bookings until its production readiness items are complete.

The Cloudflare Workers Free TiDB profile staging deployment and remaining live-booking requirements are documented in [README-CLOUDFLARE-FREE.md](README-CLOUDFLARE-FREE.md).
