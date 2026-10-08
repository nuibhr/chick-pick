# Open Play: five-minute seat holds

## Rules

- New manual-transfer Open Play bookings reserve one seat for five minutes, from the server's creation time. Every booking uses the same policy, including nearly full games.
- Retrying a booking for the same LINE account returns the same booking and original deadline. It does not reserve another seat or extend the deadline.
- At the exact deadline, an unpaid booking without a pending receipt no longer counts toward capacity. The next booking transaction can claim that seat immediately; no scheduled cleanup or open browser is required.
- Receipt evidence committed before expiry keeps the seat while SlipOK and staff review it. A failed or delayed SlipOK result still awaits staff review and does not automatically release the seat or approve money.
- Paid, admitted and unresolved historical Stripe bookings retain their seats. Existing Open Play bookings without a deadline are preserved. Coach bookings retain their existing 30-minute policy.
- A rejected receipt no longer protects an expired hold. The player must contact the organizer if already paid; the app must not encourage a second transfer.

## Enforcement

Cloudflare booking writes lock the marketplace document with TiDB `SELECT ... FOR UPDATE`. Receipt submission uses the same first document lock through `updateFinance`. Capacity, player identity, expiry, duplicate images and receipt eligibility are checked inside that transaction.

Upload eligibility is checked both before reading/storing the image and again under the database lock. An upload that crosses the deadline cannot reclaim a seat already sold to somebody else. Known rejection removes the new orphan image; unknown commit outcomes retain evidence as before.

Expired entries remain in booking history. Public availability, admin active counts, pending income and game settlement eligibility use the same expiry rule. Expired unpaid holds are void finance entries, not revenue.

QR creation, external QR pages and image downloads check expiry. QR link expiry is capped at the original hold deadline; opening another QR does not restart the reservation. The download page displays the payment deadline. A previously saved PromptPay image cannot be revoked by this app inside a bank app: anyone who transfers after losing a seat needs organizer reconciliation/refund, never automatic admission.

## Player UI

The booking page displays a countdown based on server time, expiry guidance, and protection while a slip is pending. Transfer instructions, QR and upload controls disappear once the hold expires. Listings refresh every 30 seconds, on returning to the foreground and when a local countdown reaches expiry; the authoritative booking transaction always checks current availability.

## Validation

97 existing/new tests passed together, followed by a passing additional QR-deadline test (98 total tests covered). TypeScript checking and the Cloudflare frontend build passed. Tests cover concurrent last-seat buyers, same-account retries, exact expiry, deadline crossing during private image storage, evidence protection, expired QR/upload rejection, rebooking, own-ticket identity filtering, finance void status, old booking preservation and QR deadline capping.

These are automated fixture tests using the transaction adapter's shared lock, not artificial purchases or slip approvals in the live database. A real LINE phone test of the five-minute countdown and background/foreground behavior is still required.

## Hosted verification

Deployed to the existing `chick-pick-tidb-staging.nuibhr1.workers.dev` Worker, version `5a5310be-03a1-4762-8620-9dc542079c43`. The live frontend serves `index-By3UVLQc.js`; health reports TiDB available and LINE/SlipOK configured. Public catalog has no over-capacity games. Browser inspection of an existing Open Play detail dialog confirms the five-minute rule is visible before login/join. No live booking or payment was created or approved for this verification.
