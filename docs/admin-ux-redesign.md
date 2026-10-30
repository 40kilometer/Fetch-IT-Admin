# Admin task-focused UX

Admin home now leads with independent case decisions, service exceptions and unassigned reviews. Decision eligibility still excludes the requester and assigned reviewer; API rules remain authoritative. Review views preserve team scope, priority, search and pagination. Detailed approval states are visible to Admin without changing the simpler staff queue vocabulary.

Case recommendations and reason-required approval/return controls are adjacent. Confirmation shows entered values before saving. Assignment and internal-note forms use disclosure controls. Approvals still do not automatically transfer funds or restrict accounts.

The support dashboard and awaiting-reply queue share the same predicate across Open and In progress records. Sorting, searching and pagination preserve that scope. Booking/audit filters update automatically, show applied filters and preserve search focus. Application lists default to actionable stages; active services and drafts remain available through the status selector. Stage, summary and record labels share one vocabulary. Service decisions show orientation/assessment prerequisites and stage shortcuts; exception requirements remain unchanged.

Notifications group decisions, customer replies and operational follow-up, with one row per record. Reading remains distinct from completion. Audit views batch-resolve names and group adjacent related actions within five minutes, retaining each event and all recorded details inside the group. No audit rows are rewritten or removed.

Verification: 98 focused tests covering permission boundaries, independent decisions, immutable service exceptions, filter races/cursors, shared awaiting-reply predicates and notification grouping. Production webpack build passes. Browser verification uses existing accounts and read-only navigation; no operational decisions or customer messages are submitted.

Application filter tests are scoped to this repository rather than assuming sibling checkouts exist. Other applications are not part of this release.
