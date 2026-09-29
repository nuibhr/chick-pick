# Chick&Pick: gap analysis and development plan

Reviewed: 2026-09-22. Scope: active React/Vite + Express application, Turno source and OpenLeague source. This is a recommendation report; no application code or deployment was changed for this review. Repository branches may change after this review. Remote applications were not deployed or independently security-audited.

## Recommendation

Keep Chick&Pick as the product and preserve its 3D identity, booking/coaching UI and existing finance logic. Use Turno as the reference for on-court fairness. Adapt selected OpenLeague membership, registration, waitlist and audit patterns into the existing backend. Do not merge entire repositories or introduce a second login, database or accounting ledger.

OpenLeague uses Next.js Server Actions, Auth.js, Prisma/PostgreSQL and MUI. Chick&Pick uses React/Vite and Express. Functions importing next/cache, application-specific permission helpers and its Prisma schema require adaptation; this is not an installable drop-in sports SDK. Its schema and standings also contain hockey-specific concepts.

Sources: https://github.com/mbeacom/openleague ; https://github.com/mbeacom/openleague/blob/main/package.json ; https://github.com/mbeacom/openleague/blob/main/lib/actions/event-registrations.ts ; https://github.com/mbeacom/openleague/blob/main/prisma/schema.prisma

## What the active app really has

- Interactive 3D court, mascot, doubles rotation, winner selection, winner-splitting king mode, one-allocation skip, global court mix and manually entered skill ratings.
- Local rewards simulation: one-percent contribution, following-month eligibility, carry-forward, manual champion award and point redemption history.
- Existing demo bookings; hourly/course coaching with scheduling conflict checks and completion/cancellation; admin login, ledger, revenue rules, settlement snapshots and CSV export.
- Court state and rewards live in browser localStorage. Marketplace/coaching/finance use local JSON files. They do not share a real member identity or a complete session-to-match-to-reward relationship.
- Marketplace uses demo_player. Production guards disable marketplace, coaching and finance APIs. A successful build is not production readiness.

Local evidence: src/main.tsx; src/MvpApp.tsx; src/CourtClub.tsx; src/clubEngine.ts; server.marketplace.ts; server/marketplace.ts; server/coaching.ts; server/finance.ts; README.md.

## Turno features we should add

| Gap | Value | Priority |
| --- | --- | --- |
| Partner/opponent history penalties | Avoid repeatedly pairing the same people when skill averages tie | First |
| Separate real completed games from fairness seed | New arrivals can join fairly without falsely showing games played | First |
| Remove/depart, substitute, clear a court, decrease courts | Handle injury, early departure and unavailable courts | First |
| Pause after current game and longer hold | Distinguish rest after play from skip-next-allocation | First |
| Singles and fixed partners | Support more session formats | Later |
| Optional consecutive-win cap | Prevent court monopolization when fairness is the session goal | Configurable |
| Win/Lose queues | Alternate competitive social format | Later |
| Installable PWA / offline shell | Reopen and run a local session when connectivity drops | Before broad rollout |

Sources: https://github.com/dev-jolo/turno/blob/main/src/engine/types.ts ; https://github.com/dev-jolo/turno/blob/main/src/engine/reducer.ts ; https://github.com/dev-jolo/turno/blob/main/src/engine/constants.ts ; https://github.com/dev-jolo/turno/blob/main/src/engine/modes.ts ; https://github.com/dev-jolo/turno

Keep the user's rules: king winners split into opposite teams. Turno's configuration keeps them partnered, so copying its king strategy unchanged would violate this requirement. Its hold/return fairness rules also differ from our promise to preserve skip-round priority.

## Specific defects and limitations found locally

1. addPlayer seeds the displayed played field with the waiting minimum. A brand-new player can appear to have completed games. If nobody waits, Math.min(...played, 0) forces zero instead, making newcomer fairness inconsistent. Separate gamesCompleted and queueSeed.
2. balanced checks three splits for only the selected four players. It is not global optimization across the whole roster and has no repeat-partner history or randomized tie-break. Preserve queue fairness while considering a bounded candidate window.
3. CourtClub uses one global browser session and reward book, not a sessionId-scoped model. Booking a named event does not automatically build that event's checked-in roster.
4. Match history is a maximum of 30 descriptive strings. It cannot reliably support score correction, monthly standings, disputed results or an auditable championship.
5. No undo-result workflow; no actual points score, game duration or verified result submission.
6. Award selection is manual. It does not prove a championship took place, bind to a tournament, or allocate a doubles prize between two winning members.
7. Rewards have no stock reservation, shipping/pickup fulfillment, payment-refund reversals or server authority. Users can modify browser data; never treat it as a real balance.
8. 3D scene has four illustrative mascots; it is not bound to current court rosters, live score or player-specific avatars.

## What OpenLeague can contribute

| Area | Evidence | Recommended adaptation |
| --- | --- | --- |
| Members, teams, leagues, role-scoped records | User, TeamMember, League, AuditLog schema; authenticated actions | Club/member/organizer/coach permissions with one canonical identity |
| Invitations, calendar, attendance | README and RSVP action with membership checks | Invite links, availability and check-in; attendance is distinct from payment |
| Registration and waitlist | Registration actions plus FIFO offers and Serializable transactions | Atomic capacity reservation, expiring offer, cancellation that offers the seat to the next person |
| Payments and refunds | Stripe checkout/refund calls and webhook route | Adapt the verified-provider-event pattern; do not assume Thai payment methods or existing merchant configuration work automatically |
| Tournament standings | Pure computeStandings function based on completed games | Rework to approved pickleball scoring and tiebreak rules; current code has hockey goals and ties |
| Equipment operations | Gear schema and source modules for reservations, ledger and handoffs | Inspiration for stock/pickup workflow, not an existing champion-points shop |

Sources:
- https://github.com/mbeacom/openleague/blob/main/prisma/schema.prisma
- https://github.com/mbeacom/openleague/blob/main/lib/actions/rsvp.ts
- https://github.com/mbeacom/openleague/blob/main/lib/actions/event-registrations.ts
- https://github.com/mbeacom/openleague/blob/main/lib/utils/event-waitlist.ts
- https://github.com/mbeacom/openleague/blob/main/app/api/webhooks/stripe/route.ts
- https://github.com/mbeacom/openleague/blob/main/lib/utils/event-standings.ts
- https://github.com/mbeacom/openleague/tree/main/lib/services

Evidence limits: inspected selected files, not an exhaustive audit. Standings implementation does not by itself prove a complete bracket/seeding engine. README production claims are the author's claims, not our deployment verification. Do not assume its equipment system implements point redemption.

## Ordered delivery plan

### 1. Make one real club work end to end

Canonical data: Member -> ClubMembership -> Session -> Booking -> CheckIn -> Match -> Result.

- Real login, organizer/coach/member ownership checks, transactional database and backups with restore test.
- Connect bookings, roster, court queue, coaching and member profile through stable IDs; keep existing records during migration.
- Fix newcomer fairness, repeat partners, remove/substitute, pause-after-game, match result records and undo with audit trail.
- Synchronize organizer and player views. Use revision checks/idempotency so two devices cannot finish one game twice.
- Before real payments, validate payment, cancellation, waitlist, reconciliation and refund behavior.

Acceptance: two phones see the same queue; reload/reconnect retains it; booking last seat concurrently confirms only allowed capacity; unauthorized member cannot edit another club; restore recovers sessions and balances.

### 2. Complete championship and rewards

Canonical data: Tournament -> Entrant -> MatchResult -> FinalStanding -> Award; PaymentEvent -> ContributionEntry -> MonthlyPool -> Award -> PointsEntry -> Redemption -> Fulfillment.

- Separate king of an individual court from monthly champion.
- Choose supported competition format, qualification window, divisions, minimum games and tiebreaks. Initial recommendation: round-robin groups plus final, not every tournament format at once.
- Lock confirmed results, record corrections and require organizer finalization before reward creation.
- Contributions only from verified eligible payments; explicitly define whether booking and coaching payments both qualify. Default proposal: eligible paid amount less refunds, excluding purchased gift balance to avoid double counting.
- Decide funding from platform share before existing partner settlements are finalized; this is a business rule to approve, not silently infer.
- Keep money in satang and reward points separate; preserve fractional accrual. If doubles champions share the pool, use a documented split with deterministic remainder handling.
- No championship -> carry forward. One idempotent award per competition/pool allocation; multiple divisions require allocation budgets.
- Atomic point deduction plus stock reservation; order statuses pending/pickup/shipped/completed/cancelled; reverse points if fulfillment fails.

Acceptance: verified 10,000 baht eligible payment contributes 100 baht once, never from a booking click; September contributions become eligible in October; failed duplicate webhook adds nothing; refund reverses appropriate contribution; last stock item cannot be redeemed twice; champion can only receive an authorized finalized award.

### 3. Make it delightful and operable

- Player mode: next court, wait estimate with uncertainty, personal stats, booking and learning balance.
- Organizer mode: check-in, courts, corrections, no-shows, attendance, financial reconciliation.
- Public TV mode: court calls and upcoming queue without private contact or payment information.
- 3D characters reflect players/team colors/crown; retain a clear accessible 2D list and lightweight mode for slower phones. Prefer fast readable court controls during games.
- Coaching: working hours, leave, venue availability, learner history, expiring course balance and reschedule/refund rules. Preserve existing overlap checks.
- Notifications with user preferences, calendar links, error reporting and tested device support.
- Installable offline shell; one designated offline session controller with queued reconciliation. Do not allow offline financial settlement or reward issuance from multiple writers.
- Pilot at one real club before multi-club rollout; measure waiting-time spread, repeat-pair rate, no-shows, payment failures and redemption completion.

## Licensing and reuse

OpenLeague labels source Apache-2.0; documentation has CC BY 4.0 terms and its name/logo are separately reserved. Track selected files, exact upstream revision, LICENSE/NOTICE and modifications when incorporating code. Do not import its branding. This review did not copy upstream source into the app.

Sources: https://github.com/mbeacom/openleague/blob/main/LICENSE ; https://github.com/mbeacom/openleague/blob/main/NOTICE ; https://github.com/mbeacom/openleague/blob/main/TRADEMARKS.md
