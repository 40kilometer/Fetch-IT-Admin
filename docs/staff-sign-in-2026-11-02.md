# Password sign-in and expanded staff team

The live portal uses individual staff email/password sign-in. The sidebar switcher and login-page account picker have been removed. `/staff` and `/demo` redirect to `/login`; all retired `/api/auth/demo` methods return 410 without changing sessions. Previously delegated sessions are denied by the common staff authorization boundary and must sign in again. Normal Admin and staff sessions retain their existing expiration, role, restriction and revocation checks.

Legacy grant parsing remains only for cookie/session cleanup on ordinary sign-in and logout. The account-switching implementation and picker component have been removed. The separate localhost-only isolated rider lab remains separate from production authentication.

## Accounts and operating history

`scripts/expand-staff-team.cjs` provisions five additional role-limited accounts: two Customer Support, one Support Supervisor and two Safety reviewers. It reuses the existing three active staff accounts and 24 existing generated Customer accounts. Existing passwords, role policies and the retired Finance account are unchanged. It adds 24 support requests, conversations and internal notes, plus 10 linked supervisor/Safety cases at open, review, Admin-decision and resolved stages.

The additive batch `team_operations_20261102_v1` has stable record IDs and audit metadata with `synthetic: true`, its batch and source. Staff provisioning has separate real `STAFF_CREATED` audit records. No existing bookings or applications are changed, and the runner has no writes to bookings, notifications, application email or service-approval tables. No customer delivery is triggered. Safety completion history preserves the independent Admin decision gate.

The runner defaults to a read-only preflight, checks the production target against the configured restricted connection, rejects account conflicts and applies in a transaction behind a named-batch gate and advisory lock. Credentials use random per-account passwords, the application's scrypt format, and a private ignored file. Reruns do not replace accounts or passwords. No passwords or database secrets are committed.

## Verification

- 171 automated checks passed, including retired endpoint behavior for anonymous/Admin/all staff, rejection of legacy switched sessions, password sign-in and logout cleanup, normal role/revocation checks, redirects, and the generated workload's links, role ownership and event chronology.
- Production webpack build and TypeScript passed.
- All eight staff passwords matched their saved database hash. Each account passed local password sign-in, session role verification, workspace loading, disabled-switch endpoint and logout. The old picker URLs redirected to sign-in.
- Admin browser checks confirmed the CS roster contains five active members with assigned requests and reviews. The Safety roster contains three members with assigned reviews. Existing team management and audit links remain Admin-only.

Private credential and verification artifacts are stored under ignored `tmp/staff-team/`. The generated team history is an imitation requested by the user, rather than evidence that actual employees performed those actions.
