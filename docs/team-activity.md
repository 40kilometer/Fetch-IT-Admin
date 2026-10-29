# Team activity batch - 29 October 2026

`team_activity_20261029_v1` adds the user-requested fictional work history to the existing system. Normal workspace wording is used; source provenance remains in audit details and the local manifest.

The batch uses 24 customers from the existing generated 900-account manifest, and the existing Admin, Customer Support, Support Supervisor, Finance, and Safety accounts as the recorded workflow actors. It creates 72 terminal historical bookings (60 delivered, 12 cancelled), 28 support conversations with 70 messages and 24 internal notes, 18 linked team reviews, 4 resources, and 12 additional rider applications with 86 private reference attachments. New applicant and historical-courier identities use `.invalid` addresses, have no authentication identity, and remain offline. There are no new credentials, live jobs, notification records, queued emails, or service grants.

Application stages: 3 Submitted, 3 In review, 2 Needs correction, 2 Orientation scheduled, and 2 Assessed. Reference attachments are illustrative packets and monogram placeholders, not issued credentials or identity photographs. They cannot establish actual eligibility. Applicant email verification is unset.

## Reproduction

Run `node scripts/seed-team-activity.cjs` for a read-only plan. It verifies that the existing maintenance connection targets the same database as the production Admin connection, matches selected customers against the original synthetic manifest, checks staff roles, and validates relationships and timelines. It stores its stable reference time and reviewed plan under ignored `tmp/team-activity/`.

Prepare profile placeholders with `node scripts/prepare-team-avatars.cjs`, then run `scripts/prepare-team-attachments.py` with the bundled PDF dependencies. Visually inspect representative PDF renders and confirm the asset manifest hashes before applying.

An explicit apply requires `APPLY_TEAM_ACTIVITY=team_activity_20261029_v1` and `node scripts/seed-team-activity.cjs --apply`. Private files are uploaded first; all database rows are inserted in one transaction under a batch lock. The transaction verifies the expected row counts and confirms that notifications, email queue, credentials, and rider service grants are unchanged. Existing records are never updated or deleted.

Rerunning a complete batch reports `alreadyApplied` without changing records or uploading new files. A partial or conflicting batch fails for inspection. The runner retains uploaded-file metadata after an uncertain failure so files can be reconciled without deleting referenced data. The local `applied.json` records inserted IDs and verified counts. It contains no passwords or storage credentials and is not committed.

Validation: `node --test tests/team-activity-plan.test.cjs`. Live verification should check role-scoped queues, private attachment access, support history, Admin audit logs, and report totals without submitting business decisions.
