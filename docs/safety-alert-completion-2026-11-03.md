# Admin safety alert completion

Admin can use **Mark as done** on an active passenger safety alert in Notifications or on its Safety case detail page. A confirmation requires a private resolution note of up to 500 characters. Cancel and Escape leave the alert unchanged. Read receipts remain separate: reading an alert does not resolve it.

The action is available only to Admin and only for a Safety case with an explicit emergency timestamp. The server locks and reloads the case, checks the version, locks its linked emergency support request, and validates the customer and booking links. Ordinary Safety investigations, applications and other team cases cannot use this shortcut. Their existing recommendation/approval rules remain in force.

One transaction resolves the case and its linked emergency request, records the resolution note, and writes case/request audit entries with the Admin actor, reason, former status and completion time. An existing reviewer is preserved; an unassigned alert records the completing Admin as its reviewer. The action does not approve a recommendation, activate rider services, change a booking/payment or send a public customer message. Historical messages and evidence remain available.

Resolved alerts stop qualifying for active team intake, backup escalation and the urgent banner. Notification completion controls are derived from current server state, not local dismissal preferences. A dialog captures the case version when opened, so background polling cannot silently substitute a newer version. Failed saves preserve the entered resolution; duplicate submissions are rejected by the row lock and version check.

## Verification

- 211 automated checks passed; the optional cross-repository Customer fare check was skipped because its integration path was not supplied.
- Nine Postgres workflow checks passed in a fresh disposable schema, including simultaneous completion attempts committing one resolution, both records closing, read versus done separation, feed clearing, role restrictions and absence of customer messages/notification outbox writes. The schema was removed afterward.
- Production webpack build and TypeScript passed.
- Browser checks against the built portal confirmed the Admin detail control, notification control, required resolution field, Cancel and Escape behavior, and return to the underlying inbox. No live alert was completed, no customer reply was sent, and no call was placed during verification. The confirmation screenshot is in ignored `tmp/safety-alert-done/confirmation.png`.
