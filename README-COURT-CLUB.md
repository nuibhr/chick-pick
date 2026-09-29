
## Court Club update — 2026-09-21

Run `npm install`, then `npm run dev` and open http://localhost:3000.

- New default Court Club screen with interactive Three.js court, orbit controls, animated chicken mascots, reduced-motion support and image fallback when WebGL cannot start.
- Existing marketplace, booking, coaching, profile and finance screens remain available.
- Fair rotation chooses fewest games then oldest queue ticket; skill balancing checks all three doubles splits. Ratings are manually entered, not verified DUPR scores.
- King mode keeps winners on their original court, separates them, and takes challengers from the waiting queue. Losers join its tail. When no challengers are available winners wait; explicitly call challengers when ready.
- Skip excludes the next successful allocation and preserves queue priority. If not enough players can be allocated, the skip remains until manually resumed or a successful allocation.
- Cross-court mixing explicitly ends active games without declaring winners; available only in rotation mode.
- Rewards: payments contribute 1% using integer satang, available in the following calendar month (Bangkok month in UI). No championship means carry-over. Organizer explicitly selects the champion. One award per month, chronological order. 1 point represents 1 baht of merchandise value; fractional points accumulate, only whole points can be spent. Redemption is recorded and subtracts points. No cash withdrawal.
- Reward catalog prices are editable sample defaults: grip 80 points, ball 150, shirt 450.

### Scope and data

Court Club data uses browser localStorage keys `chicken-club-v1` and `chicken-rewards-v1`. It persists reloads on the same origin/browser, but is not account-synchronized, secure against client edits, or a production rewards ledger. Source booking demo data is not counted as real paid revenue. The simulator records test payments explicitly; no actual payment or shipping occurs.

Before real operation: authenticated organizer/member roles; server-side persistent session and rewards records; idempotent verified payment events; refund reversals; transactional redemption and stock reservation; redemption fulfillment; confirmation of reward rules. Existing finance server is preserved. These new screens have not been publicly deployed.

### Verification

`npm run lint`
`npx tsx --test src/clubEngine.test.ts server/*.test.ts`
`npm run build`

Feature reference: https://github.com/dev-jolo/turno . New implementation is written for this project; Turno source was not copied.
