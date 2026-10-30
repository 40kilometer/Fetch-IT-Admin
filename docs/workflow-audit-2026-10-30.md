# Admin workflow audit — 30 October 2026

## Outcome and repairs

Two defects were repaired:

- Application mutations previously depended on a React busy flag, which does not lock a second handler invocation until the next render. A synchronous ref now prevents competing requests immediately and releases after success or failure. The existing database version lock remains authoritative.
- Case audit entries previously retained transitions and reviewer IDs but omitted the decision/resolution reason. Future entries now retain the validated decision reason, recommendation, resolution reason or evidence note. Existing audit entries are unchanged; historical reasons were not invented or backfilled.

## Evidence

- **148 automated checks:** permissions, password login, retired Finance access, session revocation and expiry, role switching, onboarding gates, correction/resubmission rules, assessment, activation, immutable exceptions, queues, pagination, delayed saves, stale responses, duplicate clicks, failed requests, conflict recovery and audit presentation. The platform quote integration ran with the explicit Customer checkout path. Test fixtures were updated for current role policy and component contracts; managed-worktree tests no longer assume an adjacent Customer checkout.
- **Six Postgres-backed workflow checks:** a new random `fetch_workflow_test_<uuid>` schema received tables and disposable `.invalid` users. Actual application service functions and support/case route handlers ran against those tables. The auth adapter supplied test actors; production authentication was tested separately. Checks covered review ownership, concurrent writes (one commit, one version conflict), complete onboarding/activation, failed orientation/rejection, Safety exception followed by Admin approval, support claim/reply/duplicate rejection/resolution, and CS handoff through Safety findings, independent Admin decision and resolution. Audit actor and reason were asserted from saved rows.
- **Isolation:** no public-table business writes. No external email, push transport, uploaded documents, real passwords or real rider grants. Test email/notification rows remained inside the temporary schema. The test schema was removed in `finally`; cleanup was confirmed.
- **Live checks:** existing Support, Supervisor and Safety accounts signed in successfully; current-session responses were private/no-store; role workspaces and case queues loaded; application access stayed limited to Safety; Admin-only audit pages redirected with no protected record details. Logout invalidated each session. These checks submitted no business actions.
- **Browser:** the live Admin decision dashboard and onboarding entry points were inspected using the existing Admin session. Production webpack build and TypeScript validation passed.

## Interpretation and limits

The database workflow checks use real transactions but do not drive every write through browser clicks. The automated UI tests exercise the real handlers with controlled responses and retained form state. Drafts remain available after failed saves and ordinary record refreshes while the form remains mounted; recovery after tab closure or a full session-navigation reload is not implemented or claimed. Real email delivery, push-device delivery and physical document authenticity were not tested by sending to real recipients.

Protected Next.js pages may stream an HTTP 200 response containing a redirect. Verification checks the redirect destination and absence of protected audit details rather than treating status 200 alone as authorization success.

## Reproduce

Run `node --test tests/*.test.cjs tests/*.test.mjs`; set `CUSTOMER_APP_PATH` to include the optional Customer fare integration. Run the database check only with an explicitly selected maintenance connection in `DATABASE_URL` and `RUN_WORKFLOW_DATABASE_TEST=1`, then execute `node tests/workflow-database.integration.cjs`. It creates and deletes only its validated random schema. It never needs public sample records.
