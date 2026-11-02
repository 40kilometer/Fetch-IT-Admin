# Safety participant contact and operating history

## Assigned Safety workflow

After a Safety case is claimed, its assigned reviewer can use **Contact & follow-up** to load the linked customer/rider contact details, open a device dialer, record a private call outcome, and send a public reply to the linked customer conversation. Unassigned work, another reviewer's case, other teams and resolved cases cannot use these actions. Contact lookup and dialer requests are audited separately from call outcomes. Missing numbers remain unavailable rather than being invented. Native/in-device dialer support is required; there is no embedded calling-service integration.

Replies are saved as Safety-authored SupportMessage rows in the existing conversation and enqueue the existing customer notification outbox. The route schedules the existing delivery worker after the transaction. Case version checks, a case row lock and a ticket row lock reject duplicate/stale submissions. Replying does not take over the CS assignment, resolve the conversation or decide the case. A closed customer thread must be reopened by an authorized manager before sending.

Call outcomes require the linked participant, an outcome, a valid call time in Philippine time or an explicit timezone, and private notes. The action writes a workflow note and a CASE_CALL_LOGGED audit; no customer message is sent. Customer/rider IDs are resolved from the saved case/ticket/booking, not accepted from the request. Conflicting links fail closed. Customer-visible messages, call notes and internal evidence are labeled separately. Existing independent Admin decisions and resolution rules remain in force.

## Requested data updates

`scripts/refresh-admin-operations.cjs` applied the named batch `admin_operations_20261103_v1`:

- 203 existing generated completed cash bookings changed from Unpaid to Paid, with Admin payment events, references and PAYMENT_UPDATED audit records. These corrections do not fabricate participant confirmations or move funds; the reason records the owner's explicit generated-history correction.
- Eight generated rider account display names had the `Demo · ` prefix removed, including Clara Reyes, Marco Santos and Dante Ramos. The former names remain in the audit record.
- 36 additional terminal booking histories: 30 completed/Paid cash and six cancelled; 12 additional rider applications; 10 shared announcements, Safety guides and CS resources; 12 linked customer conversations; eight supervisor/Safety reviews and related audit history.
- The new applications cover draft, submitted, document review and correction stages. Document uploads are pending; no documents, orientation attendance, email verification or service approvals are invented. Existing applications and their attachments remain available.
- Two newly generated support conversations were kept open to match their active Safety reviews, with audited SUPPORT_REOPEN corrections.

The batch reuses 24 existing generated Customer accounts, the active staff team and existing generated courier profiles. It creates no login credentials, active dispatch jobs, payments through a provider, customer email deliveries or rider service grants. Record IDs and audit metadata retain `synthetic: true`, the batch and source. The runner defaults to a read-only preflight, verifies the production database target, applies the batch transactionally and returns the saved marker on rerun rather than duplicating activity.

## Display changes

Shared team announcements now appear under **Operational advisories**, with audience-role filtering, alongside the existing monitored incident/recovery records. No fictitious active platform outage was created. Payment list and booking detail use the same contextual label for an unconfirmed completed cash record; Paid/Refunded/Failed records retain their saved status. Cancelled cash bookings with no confirmations read No payment recorded.

## Verification

- All 193 automated checks passed, including assigned-reviewer access, conflicting participant links, public reply/notification behavior, private call outcomes, terminal generated bookings, payment display and shared-advisory rendering.
- Eight real Postgres workflow checks passed in a disposable schema, including simultaneous Safety replies committing only one customer message/outbox entry, private call logs, role boundaries and the existing approval flow. Schema cleanup was confirmed.
- Production webpack build and TypeScript passed.
- Database checks confirmed all 203 requested payment corrections, zero remaining completed/unpaid cash entries in the two old generated batches, zero remaining generated rider-name prefixes, and the expected new record counts. Rerunning the data setup returned Already applied.
- Browser checks used the existing Safety account to inspect an assigned review, load its permitted contacts and open the call-outcome form. No call or public customer reply was made against live work for testing. Actual contact actions were verified against disposable data. Final screenshots are under ignored tmp artifacts.
