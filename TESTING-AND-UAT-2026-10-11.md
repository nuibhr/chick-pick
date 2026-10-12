# Chick&Pick - Automated Testing and Isolated UAT

Updated 12 October 2026. This guide supersedes the original 11 October setup instructions. The preflight patch is on `audit/preflight-20261012`; no production deployment is authorized by a passing test.

## Release status

**Do not release publicly yet.** The patch covers UAT initialization, owner-code validation, definite invalid-image handling, stored-image integrity, session revocation, and additional validation. Duplicate SlipOK responses after an uncertain network outcome and evidence received after cancellation, closed settlement, or coaching expiry still require a separately reviewed reconciliation workflow. See `SECURITY-PREFLIGHT-FIXES-2026-10-12.md`.

## Automated checks

[Chick&Pick CI](https://github.com/nuibhr/chick-pick/actions/workflows/ci.yml) runs on the configured branches and pull requests to main:

1. Locked dependency installation and TypeScript validation.
2. `npm test`: unit/integration tests using fixtures and mocked external services.
3. `node scripts/preflightRegressionProof.mjs`: selected identical tests against the original and patched source, with benign controls, plus verification that the original audit baseline retained the pinned main contributions.
4. `npm run build:cloudflare`: public-asset check and frontend build.
5. Pinned Wrangler backend compilation using `--dry-run` and a local `workerd` smoke test. The local audit configuration has no database, LINE, payment or customer-image bindings. It checks startup, protected paths, headers and fail-closed behavior, not real payment processing.
6. A separate `npm audit --package-lock-only --audit-level=high` job checks known advisories without changing dependencies. A clean advisory result is not a full source-code or supply-chain certification.

Wrangler is pinned to `4.149.0`; the previously tried `4.102.0` could compile but its bundled runtime did not support compatibility date `2026-10-01`. The app's compatibility date was not reduced to conceal this mismatch.

CI does not deploy. A green job does not enforce branch protection: the owner must separately verify available GitHub protections, required checks, and reviewer restrictions for this private repository.

## Two manually requested test deployment targets

| Target | Worker | Purpose |
| --- | --- | --- |
| `ui-only` | `chick-pick-ui-sandbox` | Static UI preview; booking, payment and administrative transaction APIs disabled |
| `isolated-uat` | `chick-pick-uat-isolated` | Functional UAT using separate TiDB schema, receipt KV and LINE configuration |

The [Test Deploy workflow](https://github.com/nuibhr/chick-pick/actions/workflows/deploy-test.yml) is manual. Neither target is the original `chick-pick-tidb-staging` Worker. Do not map production routes to a test Worker.

## Owner setup for UI-only preview

Create GitHub Environment `chick-pick-uat`. Where the account plan supports them, enable required reviewers and restrict deployment branches; verify these settings actually take effect. Add environment secrets `UAT_CLOUDFLARE_API_TOKEN` and `UAT_CLOUDFLARE_ACCOUNT_ID`. Prefer an isolated test account and minimally scoped token. Do not send tokens in chat or commit them.

After code review and successful checks, an authorized owner may select the reviewed branch in Test Deploy, choose `ui-only`, and run it. The resulting URL is available only after the deployment step succeeds. UI-only cannot demonstrate an end-to-end booking or payment.

## Functional UAT resources

Prepare a separate database such as `chick_pick_uat`, a database user restricted to that schema, a separate Cloudflare KV namespace, and a distinct LINE channel and LIFF app for test users. Set the LIFF endpoint to the test Worker's `/miniapp` URL. Configure no production receiving account by default.

Configuration guards compare Worker/KV/LINE identifiers against the checked-in original configuration and require a UAT-named schema. **These checks cannot prove remote IAM isolation, account grants, or which resources a broadly scoped token can access. Verify those in the service consoles.**

### GitHub Environment secrets

| Name | Value |
| --- | --- |
| `UAT_CLOUDFLARE_API_TOKEN` | Minimal deployment token for the test account/resources |
| `UAT_CLOUDFLARE_ACCOUNT_ID` | Intended Cloudflare test account |
| `UAT_TIDB_DATABASE_URL` | Complete mysql connection URL for the separate UAT schema/user, without query overrides or fragments |
| `UAT_ADMIN_SESSION_SECRET` | Newly generated secret of at least 32 characters |
| `UAT_ADMIN_PAIRING_TOKEN` | Newly generated **exactly 12 ASCII letters/digits**; normalized to uppercase before storage, matching the real pairing API |
| `UAT_SLIPOK_API_KEY` | Optional; only alongside the matching UAT SlipOK branch ID |

### GitHub Environment variables

| Name | Value |
| --- | --- |
| `UAT_KV_NAMESPACE_ID` | Separate 32-hex-character receipt KV namespace ID |
| `UAT_LINE_CHANNEL_ID` | Separate LINE channel ID |
| `UAT_LIFF_ID` | LIFF ID belonging to that test channel |
| `UAT_PUBLIC_APP_URL` | HTTPS root `https://chick-pick-uat-isolated.<workers-subdomain>.workers.dev`, without extra path/query/port |
| `UAT_SLIPOK_BRANCH_ID` | Optional 1-10 digit branch ID, supplied together with its API key |

The former instruction allowing a 12-128-character pairing code was wrong: many such codes could not pass the real authentication endpoint. Do not reuse the fixture tokens from tests.

### Fresh database initialization

The functional workflow now runs `node --import tsx server/migrateUat.ts`, not the old table-only migration command. It checks `SELECT DATABASE()` before any writes, creates required tables, and uses `INSERT IGNORE` for:

- `marketplace`: empty sessions/bookings/profiles;
- `worker-pilot`: booking disabled, manual transfer mode.

Existing records and settings are preserved. Retrying an interrupted initialization does not reset bookings. Malformed existing marketplace data causes an error rather than silent replacement. A UAT-like database name is still not proof of least-privilege grants.

After initialization, the owner must pair LINE and configure test venues, sessions and receiving channels. A fresh database does not contain an owner, receiving account, or an automatically enabled public booking service.

The generated `.wrangler-uat.jsonc` and `.wrangler-uat.secrets.json` are ignored by Git and deleted at the end of the workflow. No real credentials were needed for unit tests or local Worker smoke tests.

## Payment acceptance testing

Begin without SlipOK credentials for UI and manual-evidence checks. Actual SlipOK testing can consume real quota; testing a real transfer requires prior agreement with the receiving-account owner and a reconciliation/refund plan. Fixtures must never be presented as real money.

Use two distinct authorized LINE test identities for the last seat. Test on-time evidence, late evidence, another player's replacement booking, invalid images, duplicate transactions, bank delays, changed bytes, owner/staff permissions, and attempted replay of a cookie after logout. Confirm no automatic reassignment of another player's seat, no duplicate income and no deletion of evidence.

Definite invalid-image codes 1005-1008 now reject the image without extending the original hold or claiming that no money exists. Ambiguous bank outcomes are not automatically treated as unpaid. Historical rejected-verification/pending records were not bulk-migrated in this patch; review them individually.

Do not treat expired coaching, cancelled bookings or already-closed settlements as fully solved. They remain release-blocking reconciliation cases, not reasons to remove the existing cancellation, capacity or financial-history safeguards.

## Boundaries of the available evidence

Unit tests mock TiDB and SlipOK; local workerd smoke tests use no configured external services. Neither proves real TiDB grants/locking under load, LINE device behavior, receipt KV propagation, live bank outcomes, backups/restores, monitoring or full secret-history hygiene. Actual hosted UAT and owner approval are still required. No production Worker, customer booking, bank approval, settlement or refund is changed by running the automated checks.
