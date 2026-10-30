# Expanded unsaved-work protection

The Admin and staff portal now captures editable selections as well as text: request status/assignee, handoff destination/priority and notes, case action fields, orientation date/venue/instructions, review status/correction reasons, attendance/pass choices, service selections/operating zone/decision reasons, reopening reasons, booking cancellation reasons and account restriction reasons. Drafts remain browser-local, scoped to the signed-in account/role/record/action and expire after 24 hours.

Forms list the fields that differ from their initial or last successfully submitted values. Reverting changes removes the unsaved marker and draft; a successful save resets that form's baseline. Failed saves do not reset controls or discard drafts. Support refreshes preserve edited status and assignment while updating the server version used for conflict checks.

Recovery requires **Restore draft**. Select options are checked against current allowed choices, restored service selections exclude services already active, and a passing assessment cannot restore without attendance. Recovery never submits an approval, sends a message, activates a service, or restores hidden record versions. Credentials/passwords and file uploads are excluded. Server-side permissions and workflow validation remain authoritative.

A shared accessible dialog lists unsaved fields and offers **Stay here** or **Continue** for navigation links, notifications, post-save redirects, toolbar refresh and switching/returning staff accounts. Escape stays on the current form. Browser refresh/close retains the browser's native warning. Back/Forward uses the Navigation API only for cancelable same-document traversals; browsers may prohibit cancellation, in which case the navigation proceeds and the draft remains recoverable. No fake history entries or patches to Next.js history state are used. Hash links and links opened in another tab do not warn unnecessarily.

Application detail components are keyed by record ID to prevent form state carrying into a different rider's record. Restriction/cancellation dialog drafts use the actual account/booking ID, and handoffs use the linked support request ID.

## Verification

- **164 automated tests passed.** New checks cover selection/empty-value recovery, reverting/committing baselines, link/refresh/Back dialog cancellation and continuation, event cleanup, unsupported traversal, support status/assignment retained across conflicts and refresh, service choices after failure and filtering already-active services, and orientation fields after a rejected save.
- TypeScript and the production webpack build passed.
- The built portal is smoke-checked over HTTP with an existing staff account, including session cleanup and authorization boundaries. No business action or outbound email/push message is submitted.
- Visual browser interaction could not be run because local browser use is disabled in Work settings. Dialog behavior is verified through the real component handlers in automated tests; visual/real-browser Back and Forward checks remain an explicit verification limit.

Platform references: installed Next.js 16.3.5 `use-router` documentation and the [HTML navigation APIs standard](https://html.spec.whatwg.org/dev/nav-history-apis.html).
