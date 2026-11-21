# Admin workspace redesign

Implemented the live interface audit across Admin and shared staff components. This release changes presentation, queue selection and navigation; it adds no database migration and does not change decision permissions or payment records.

## Layout and interaction changes

- Admin password sign-in defaults to Bookings, matching the logo destination. Valid requested return paths are preserved. Support and Safety keep their own team destinations; hidden overview/workspace/review pages still exist.
- Bookings uses search and status in a compact toolbar, with secondary payment/service/date filters in More filters. A measured desktop filter height dropped from approximately 260px to 97px. Mobile controls remain usable at 390px and tablet navigation uses a drawer through 1024px.
- Support has Unassigned, Mine, Awaiting reply, Escalated, Resolved and All requests views. Each query retains the existing staff scope. Escalated work is limited to linked cases accessible to the actor. Conversation and reply/ownership controls share one region; private notes stay separate. Single-page message lists no longer render disabled pagination.
- Safety cases group reported facts and conversation in the main column, with contact, private notes and completion in an action column. Narrow screens show reported facts, contact/follow-up, conversation/history and completion in that order. Duplicate completion instructions and duplicate original-request display are removed. Existing owner, Admin decision and resolution guards remain authoritative.
- Case links preserve team context and queue filters. Legacy case links are normalized to their receiving team. Support return links preserve queue views and search filters. Back/Forward navigation was checked in the browser.
- Notifications show urgent work first, expose sound settings in a disclosure and distinguish unassigned alerts from acknowledged cases. Reviewer names and acknowledgment state come from the current permitted case query. Read receipts, sound preferences and the reason-required Mark as done action keep their existing behavior.
- Application review has one global refresh control, which refreshes the client-fetched application as well as server data. Next-step text reflects saved checklist/orientation/assessment progress. The orientation panel uses one surface and explains missing preview prerequisites. Draft-preserving mounted panels and keyboard stage navigation remain available.
- Payment records defaults to Needs attention; All records and exact-reference search remain available. Normal historical records open details, while exceptions offer Prepare review. Bookings and Payment records share contextual payment labels. Completed rides read Completed, while deliveries read Delivered. Saved statuses are unchanged.

## Verification

- 213 automated tests passed; one optional cross-repository Customer fare integration was skipped because its path was not supplied. Coverage includes staff scopes for all new support views, safe return paths, stale/conflicting actions, draft retention and the existing independent decision gates.
- Ten real Postgres workflow checks passed in a disposable schema. The added feed check verifies current reviewer and acknowledgment state. The test schema was removed; no live business records or outbound deliveries were used for these checks.
- Production webpack build and TypeScript passed. Installed Next.js 16.3.5 documentation was consulted before editing.
- Browser checks covered Admin login landing, expanded booking filters, support views/detail, Back/Forward, notification settings, Safety context/action order, orientation, keyboard stage changes and drawer Escape behavior at desktop, 820px tablet and 390px mobile widths. Final booking load had no browser error logs. Temporary viewport overrides were reset.
- No live claim, decision, customer reply, call or payment edit was submitted during UI verification. Existing saved data and the original dirty Downloads checkout were preserved. Screenshots and detailed logs are in ignored `tmp/ux-evidence` and `tmp/ux-*.log`.
