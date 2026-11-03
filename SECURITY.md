# Security policy

Chick&Pick's current `main` branch is supported during the controlled pilot.

Report vulnerabilities privately to the repository owner through the existing private project contact. Do not create a public issue containing exploit instructions, tokens, bank details, LINE user IDs, or payment slips. Share the affected route, reproduction steps using fictitious accounts, and expected versus observed behavior. Never send live secrets or real slips as proof.

The owner should acknowledge the report, reproduce it in an isolated test environment, assess payment and personal-data impact, and coordinate a fix before disclosure. This policy does not promise a response time or constitute a completed independent security audit.

## Safeguards

- LINE identity is checked on the server. Admin roles are checked for every protected request.
- Payment destinations, amounts, capacity and payment evidence are controlled by the server; a successful SlipOK check is not court admission.
- Late evidence does not reclaim released seats. Capacity and coach overlaps are checked under the reservation transaction lock when accepting a late payment.
- Slips remain private. Cancellation and refund tracking retain evidence and audit events. Refund completion records an administrator's confirmed bank transfer; the app does not execute transfers.
- Secrets belong in local ignored environment files or deployment secrets. Never put them in `public/`, frontend environment variables, commits, issues or workflow logs.
- GitHub Actions runs type checks, tests, the frontend build, dependency audit and a basic tracked-file secret-pattern check. Weekly Dependabot updates require human review; updates are not merged automatically.

## Deployment and recovery

Production readiness still requires a separate ordinary-member LINE mobile test, verified backups and a restore drill, monitoring of pending payments/refunds, and an operator able to reconcile bank transfers. Keep trial access limited until those checks are completed.

Review GitHub's dependency and security alerts regularly. Availability of CodeQL, secret scanning, push protection and protected branches depends on repository visibility and account plan; do not make this private repository public to enable them.
