# Late Slip Evidence Recovery — 10 October 2026

## Scope

This branch changes **Open Play/manual bank transfer evidence submission**, not the booking lock policy or coaching policy. No production deployment or payment has been performed as part of the change.

A new booking reserves one seat for **five minutes**. Uploading a valid receipt *and committing it before the deadline* continues to protect the seat during SlipOK and staff review. Once the deadline has elapsed without such evidence, the seat is released for another player immediately.

## Late receipt workflow

1. A LINE-authenticated owner of the original booking can submit the **existing transfer slip**, including after the hold expired, for up to **24 hours after the original deadline**. The QR-generation and new-transfer controls remain disabled; this is for evidence recovery only.
2. The private image and its SHA-256 are stored as before. A marker `submittedAfterHold: true` is set **under the same TiDB transaction lock used by bookings**. Verification goes through the existing SlipOK service with the saved booking amount and payee snapshot.
3. A late-pending receipt **does not reserve capacity**. The player sees a clear warning that the seat has been released; no one should pay again. The owner/staff receipt queue includes late evidence even when the seat itself is no longer active.
4. Only an authenticated finance reviewer can approve. A late receipt **cannot be approved** unless SlipOK verified the transaction, the bank transaction time was within the original booking's five-minute window, the game is still open, and the original seat can be restored without exceeding capacity or conflicting with another active booking by the player. The reviewer must separately confirm real bank funds.
5. If the transfer was late, capacity has been taken, or the game cannot be reinstated, do **not** approve the booking. The admin must cancel/flag refund and reconcile the transfer using the existing audited refund workflow. Late evidence is retained for reconciliation, not thrown away.
6. Revenue settlement is blocked while any non-cancelled slip remains pending, even if its seat was released. Duplicate image and bank transfer reference safeguards remain active.

## Safety properties

- The original `holdExpiresAt` is **never extended** and opening/saving a PromptPay QR does not change it.
- The expiry and receipt logic is decided on the server; local phone time cannot grant a seat.
- The booking and receipt changes use existing transaction locks; a race against another customer booking cannot oversell the final seat.
- Uploads after 24 hours require direct organizer support. The old booking remains in history.
- The change does not auto-approve transfers, create refunds, move money, or turn legacy Stripe payments back on.
- The system continues to use **Cloudflare Workers + TiDB + KV + SlipOK**, not D1.
- The owner must complete actual LINE mobile, bank and SlipOK checks in staging before considering production rollout.

## Regression tests to run before merge

Run the repository's existing Cloudflare/booking test suite and `npm run lint`, plus `npm run build:cloudflare`. In particular verify:

- expiry at the exact five-minute mark; non-extended lock;
- uploading during a slow store operation across expiry preserves evidence but does not reclaim a sold seat;
- genuine transfer within the original window can be manually approved **only** when capacity remains;
- transfers outside the window cannot result in booking approval;
- duplicate slips/reference values are rejected and finance refunds are tracked;
- 24-hour late upload deadline and no new QR;
- the admin receives late pending receipts and revenue cannot settle until they're resolved;
- the player clearly sees evidence accepted but **no guaranteed seat**.

## Manual UAT

Use two distinct LINE identities. Have player A book the final seat, transfer on time, wait past five minutes, and upload afterward. Have player B book the released seat. Confirm A cannot be approved while B occupies it. Cancel B's booking in staging and confirm the reviewer can safely process A only after checking the original bank transfer time and genuine funds. Repeat using a transfer after the five-minute deadline and confirm it goes to reconciliation/refund, not admission.
