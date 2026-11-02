# Safety Review alert sounds

Admin and Safety users can open Notifications and enable a short two-tone Safety Review chime. Enable and Test sound are explicit user gestures. Test previews the chime without opting into automatic playback; Mute stops the current audio context. Playback requires activation for each visit; a saved per-account browser preference explains reactivation after reopening. CS, supervisors and owner-only platform roles have no sound controls.

The notification query classifies existing authorized rider-application notices and cases whose saved kind is `SAFETY`. It does not classify support, escalation, payment, security or general operational notices as Safety sounds. This adds a response field and changes no recipient/access rules, database schema, review state or read status.

Only new unread event IDs after the first successful feed snapshot are eligible. The initial backlog, revisiting a notification view, refresh, reconnect without a new event, and events observed while muted remain silent. Personal/team duplicate IDs produce one chime. Browser Web Locks plus bounded local receipts deduplicate across tabs and coalesce bursts within ten seconds. Storage/lock fallback keeps the current tab usable, with best-effort deduplication where those browser capabilities are unavailable.

The existing polling cadence remains five seconds for Safety and fifteen for Admin. Opting in permits polling in an open background tab, subject to browser throttling; this is not audio delivery when the portal/browser is closed. Unsupported or suspended audio reports feedback beside the controls, while visual alerts remain available. Audio is synthesized locally, with no external sound asset or new service dependency. Account changes and component cleanup close audio and discard pending callbacks.

## Verification

- All 179 automated checks passed, including eight sound checks covering classification, role visibility, silent backlog, repeated IDs, read/unread changes, mute, preview-only playback, account changes, cross-tab mute, cooldown receipts and blocked storage.
- Production webpack build and TypeScript passed.
- Built-portal browser checks exercised Enable, Test sound and Mute with no browser error/warning logs. Playback activation reported on, and mute reported off. Hardware speaker audibility is left to the user's Test sound control.
- Local API/real database comparison checked all visible notification categories for existing CS and Safety accounts: 25 CS notices with zero Safety classifications; 22 Safety notices including 17 eligible Safety classifications. The API flag agreed with the saved case kind/application type. Test sessions were logged out.
- No business record, customer message, email, push notification, claim or decision was created for verification.
