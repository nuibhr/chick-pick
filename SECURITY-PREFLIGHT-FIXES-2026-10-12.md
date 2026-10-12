# Chick&Pick preflight remediation - 12 October 2026

## Decision

**Not approved for a public/real-money release.** This is a scoped remediation of the preproduction review, not a claim that every security or payment-reconciliation issue has been solved. No production deployment, real bank transaction, refund, settlement or customer-data migration is part of this work.

Starting application commit: `e67a006077c619a8724681d19f939237cb14d1a0`.
Pinned main integration reference: `08d60990bb9a39d2fe05db5535dad2dac0886dbf`.
Working branch: `audit/preflight-20261012`.

## Implemented changes

### UAT starts from an empty database safely

`server/uatBootstrap.ts` and `server/migrateUat.ts` check the actually selected database before any schema writes, initialize required marketplace/pilot documents with INSERT IGNORE, and validate the resulting marketplace. A fresh installation remains closed for booking. Existing data and settings are not replaced on retries. Five fixture tests cover fresh state, preserved data, non-UAT refusal, interrupted initialization and malformed existing documents.

The deployment workflow uses this UAT-specific command rather than the original table-only migration. Real TiDB user grants and real-database execution remain unverified; a UAT-like name alone does not prove isolation.

### Owner pairing and environment values follow the real contract

`scripts/prepareUatDeployment.mjs` accepts exactly twelve ASCII letters/digits for the pairing token and stores its uppercase form. It rejects database query overrides/fragments, malformed test URLs, inconsistent LINE identifiers and invalid SlipOK key/branch pairs. The guide no longer recommends arbitrary 12-128-character tokens or claims the local configuration guard proves remote IAM separation.

### Definite invalid images no longer stay pending forever

`cloudflare/slipokReceipts.ts` marks the receipt image rejected when the SlipOK result is a definite unsupported/invalid-image or missing/non-payment-QR code (1005-1008). It keeps the private bytes, hash and history; does not cancel the booking, claim missing funds, renew the deadline, approve a transfer or issue a refund. Normal expiry then uses the unchanged original hold rules.

This change is applied at the verification transaction boundary, not by broadly changing all hold calculations. The original `src/bookingHold.ts` and `src/coachingTypes.ts` behavior is retained. This avoids a dangerous variant where a later coaching rejection could renew an already released slot. Existing historical records were not bulk-modified.

Codes 1009-1014, including bank delay, duplicate, amount mismatch and payee mismatch, are not treated as proof of no money. Their unresolved evidence remains protected for review. This preserves safety but means the general stale-review operational backlog is not solved by this patch.

### Stored image integrity is checked on normal verification too

For receipts with a saved SHA-256, every verification compares the bytes retrieved from storage before contacting SlipOK. Previously the comparison was limited to parser-repair paths. A mismatch keeps evidence and returns a retry/review state; it cannot create paid status. Legacy rows without hashes retain the prior policy rather than being silently rewritten.

### Logout revokes the copied session on the server

`cloudflare/pilotAuth.ts` validates signed-cookie structure and checks a durable revocation store before owner/team authorization. Logout stores only a hash of the token with its existing expiry; expired entries are pruned. The original HMAC cookie, short lifetime, Secure/HttpOnly/SameSite settings and role-version checks remain in place.

`cloudflare/adminLogout.ts` enforces POST and same-origin checks and waits for revocation before reporting success. Failed or uncertain storage does not produce a false successful logout. Missing, forged and expired tokens cannot fill the revocation store. Other independent sessions remain valid: this is not an all-devices logout feature. Requests already authenticated before revocation are not retroactively cancelled.

### Public routing preserves business logic

The former complete `cloudflare/pilot.ts` source was copied byte-for-byte to `cloudflare/pilotRoutes.ts` (original blob `2ebe0eedbaebf7ed0fa27aead8afb3b143f6d3b9`). The canonical `pilot.ts` entry point now intercepts logout and normalizes receipt-upload responses so the public status agrees with automatic invalid-image rejection. All other existing business routes and guards are dispatched as before. The hosted entry point continues to import the canonical wrapper.

### CI validates more than frontend compilation

The configured CI checks TypeScript, the test suite, public assets, frontend build, backend bundling with `wrangler deploy --dry-run`, and a real local `workerd` startup using an unconfigured loopback-only audit Worker. Sensitive paths, headers and missing-service failures are checked without external customer services.

Wrangler 4.102.0 initially passed bundling but failed runtime startup because it did not support the application's 2026-10-01 compatibility date. The tool is now pinned to 4.149.0; the application's date was not downgraded to hide the failure. Both CI and test-deploy use the same pinned tool version. GitHub actions are SHA-pinned and checkout credentials are not persisted.

A separate npm lockfile advisory job is read-only and fails on high/critical known advisories. It does not automatically upgrade packages. It does not cover unlisted tools installed outside the application lockfile, unknown vulnerabilities, malicious publishers, source-code logic or full Git secret history.

## Validation evidence and reproducibility

The first remediation run at `772ecfd349f96b657c160b06b960b9950059bd42` executed **155 tests: 155 passed, zero failed or skipped**. It also exposed the old-runtime compatibility failure, so that run was not a complete CI pass: [initial run](https://github.com/nuibhr/chick-pick/actions/runs/38228303769).

After the tool update, [run 38229125464](https://github.com/nuibhr/chick-pick/actions/runs/38229125464) passed the application validation job including local workerd; its separate lockfile audit reported `found 0 vulnerabilities`. These observations apply to that run and source revision, not every future commit. The pull-request validation comment should identify the latest tested revision and run after integration.

`scripts/preflightRegressionProof.mjs` also runs selected identical tests against the starting commit and patched checkout. It requires four targeted baseline assertion failures to pass on the patch and two benign controls to pass on both. Module-resolution or syntax failures cannot stand in for a demonstrated safety assertion failure. Its main-contribution check compares all changed main paths at pinned historical commits; only blank-line-only workflow formatting and additive README documentation receive special handling. This is targeted differential evidence, not a full penetration test or execution of every Trail of Bits plugin.

The local test installation uses fake actors/accounts/receipts, mocked TiDB operations and mocked SlipOK fetches. None of those fixtures prove successful live bank transfers. The runtime smoke test is also intentionally unconfigured: actual bank, LINE, TiDB and KV integration still needs isolated UAT.

## Remaining release blockers

1. **SlipOK uncertain outcome followed by 1012 duplicate:** a narrowly scoped, audited same-transfer recovery/reconciliation path is still required. Do not accept all duplicates, ignore receiver checks or disable provider logging as a shortcut.
2. **Evidence after cancellation, closed settlement or coaching expiry:** implement an independent payment-evidence case and financial correction workflow. Do not restore sold seats or overwrite closed financial history to make an upload succeed.
3. **Real integration and operations:** two-player LINE/mobile UAT, real TiDB authorization/locking, KV visibility delays, bounded retry/backlog monitoring, and backup/restore tests remain unverified.
4. **Repository/deployment controls:** verify effective branch protection, required checks and review restrictions supported by the account. The patch does not enable these settings or alter GitHub plans. Do not make the private repository public as a workaround.
5. **Broader assurance:** full-history secret scanning, independent source review, load testing, retention policy and all-device session-revocation design are not completed here.

Keep the review draft and production unchanged until the unresolved payment paths and operational acceptance gates are addressed. A passing test count or a clean dependency advisory report alone is not release approval.
