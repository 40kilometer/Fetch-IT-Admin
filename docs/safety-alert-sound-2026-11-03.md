# Safety Review alert sounds

Admin and Safety users can open Notifications and enable a stronger Safety Review alert: three alternating high/low beep pairs lasting about 1.6 seconds. Test sound previews it without enabling automatic playback. On/Off is saved per account on the current browser and restored automatically after reopening; only an explicit Mute or a synchronized mute from another tab turns it off. CS, supervisors and owner-only platform roles have no sound controls.

Saved intent is separate from browser playback readiness. Suspended or interrupted audio attempts recovery on focus, visibility changes and the next pointer/key interaction. Browser autoplay restrictions may still require that interaction or the Resume audio button, but never erase the saved On choice. New unread alerts wait for recovery; read/removed alerts and account changes discard the pending work. Failed playback does not consume shared deduplication receipts. Storage failure reports that persistence could not be saved while preserving the current setting.

The notification query classifies existing authorized rider-application notices and cases whose saved kind is `SAFETY`. It does not classify support, escalation, payment, security or general operational notices as Safety sounds. This adds a response field and changes no recipient/access rules, database schema, review state or read status.

Only new unread event IDs after the first successful feed snapshot are eligible. The initial backlog, revisiting a notification view, refresh, reconnect without a new event, and events observed while muted remain silent. Personal/team duplicate IDs produce one chime. Browser Web Locks plus bounded local receipts deduplicate across tabs and coalesce bursts within ten seconds. Storage/lock fallback keeps the current tab usable, with best-effort deduplication where those browser capabilities are unavailable.

The existing polling cadence remains five seconds for Safety and fifteen for Admin. Opting in permits polling in an open background tab, subject to browser throttling; this is not audio delivery when the portal/browser is closed. Unsupported or suspended audio reports feedback beside the controls, while visual alerts remain available. Audio is synthesized locally, with no external sound asset or new service dependency. Account changes and component cleanup close audio and discard pending callbacks.

## Verification

- All 184 automated checks passed, including thirteen sound checks covering classification, role visibility, silent backlog, repeated IDs, read/unread changes, mute, preview-only playback, account changes, cross-tab mute, cooldown receipts, blocked storage, reload persistence, suspension recovery, pending browser permission and playback failure receipts.
- Production webpack build and TypeScript passed.
- Built-portal browser checks exercised Enable, Test sound and Mute with no browser error/warning logs. Playback activation reported on, and mute reported off. Hardware speaker audibility is left to the user's Test sound control.
- The persistence repair was checked with actual browser reloads after On and after Mute. Each restored the saved choice. Browser-blocked startup retained On and exposed Resume audio; a Test sound interaction resumed playback without changing the preference. No warning/error logs appeared in this check.
- Local API/real database comparison checked all visible notification categories for existing CS and Safety accounts: 25 CS notices with zero Safety classifications; 22 Safety notices including 17 eligible Safety classifications. The API flag agreed with the saved case kind/application type. Test sessions were logged out.
- No business record, customer message, email, push notification, claim or decision was created for verification.
