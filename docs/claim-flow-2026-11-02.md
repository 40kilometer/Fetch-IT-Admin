# Claim confirmations and action-driven support status

## Behavior

- Ordinary clicks on **unassigned support cards** open a confirmation naming the customer/reference. **Claim & start review** assigns the signed-in staff member, immediately saves `IN_PROGRESS` and opens the conversation. **View only** opens it without mutation; **Cancel** stays in the queue. Modified/new-tab navigation opens for viewing without silently claiming.
- Already-owned and resolved cards open normally. Inbox ownership reads **Under review by [name]** for in-progress work, **Assigned to [name]** for older assigned/open records and the owner for resolved work. Existing assignments are preserved; opening a record alone does not rewrite historical state. Older assigned/open records offer **Claim & start review** to their owner in the conversation.
- The request status dropdown and Update details button are removed. **Send reply** keeps the ticket in review; **Send and resolve** sends the reply and resolves it. A resolved request is read-only until an Admin or Support Supervisor uses **Reopen request** with a 5–2,000-character reason.
- Only the actual owner can send customer replies, including when the viewer is Admin. Admin/Supervisor can use the separate **Reassign request** disclosure to choose an eligible owner or return active work to the unassigned queue. A manager who wants to reply to someone else's ticket must explicitly reassign it first.
- Equivalent claim prompts are used for unassigned team case links and claimable rider application cards. Claiming team cases moves Open to In review; application claiming preserves orientation, assessment and approval stages. Claiming never approves a recommendation or activates services. Existing independent Admin decision rules remain in force.

## API and audit guarantees

Support PATCH accepts explicit `claim`, `reply`, `resolve`, `reassign` and `reopen` actions with the last observed `updatedAt`. It rejects raw/manual status writes. Old open browser tabs should refresh to load the new controls. The support endpoint is consumed by the Admin portal; opt-in integration callers were updated to the action contract.

The transaction locks the ticket, then rereads current access, owner and version. Two competing claims commit only one owner. Even Admin cannot use claim to replace an existing owner. Ownership changes and lifecycle transitions record actor, previous/new owner, previous/new status and the reopening reason under distinct audit actions. Claims/reassignments/reopens create no customer messages. Reply and resolution messages use the existing transactional notification outbox.

Role scopes are unchanged: this release does not let CS browse another agent's private queue or let Safety access support messages. Permission checks remain server-side. UI recovery never restores a hidden record version or submits an action automatically.

## Verification

- **173 automated checks passed**, including role-specific claim/reply/resolve paths, simultaneous claimants, manager versus owner behavior, invalid/manual status writes, reason-required reopening, popup Cancel/View only, duplicate clicks, conflict feedback and the case/application claim protocols.
- **Seven Postgres workflow checks passed** in a fresh random schema. They include two actual concurrent support claims, exactly one claim audit row, reply/resolution, reason-required reopening and the saved reopening reason. The schema was removed in `finally` and cleanup was confirmed. No live business rows or outbound deliveries were used.
- Production webpack build and TypeScript passed.
- Browser checks on the built portal verified support-card popup, Escape/Cancel, View only retaining an unassigned ticket, zero manual status selectors in the request form, another owner's read-only reply view, team case claim prompt and rider application claim prompt. Desktop and 390-pixel mobile screenshots were inspected. Real live tickets were not claimed or reassigned for testing.
- Delivery testing remains with the user. No test email or push notification was sent.
