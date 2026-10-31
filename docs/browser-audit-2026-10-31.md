# Desktop, mobile and staff browser walkthrough — 31 October 2026

## Outcome

The live portal was inspected with the actual Admin, Customer Support, Support Supervisor and Safety identities, entering staff accounts through the existing authorized switcher. Finance is retired as a staff role; Admin payment functions were checked instead. Superadmin remains outside the user's requested scope.

Three reproducible problems were repaired:

1. **Mobile reverse keyboard focus:** Shift+Tab on the first drawer link attempted to focus the Log out button inside a closed account section. Closed details descendants still reported layout rectangles. The focus list now excludes descendants of closed details while retaining their visible summary. Forward/reverse wrapping passed in the built browser. The drawer also yields keyboard handling to an open native modal, preventing it from stealing focus from the unsaved-work dialog.
2. **Phone header overflow:** long section labels allowed the header actions container to shrink below the combined width of its fixed-width buttons. The notification button/badge protruded and caused horizontal page scrolling. Header actions now retain their width and the section label wraps in the remaining space. A 320-pixel browser check measured document scroll width equal to client width (305 pixels with a scrollbar); the notification button stayed inside the header.
3. **Broken Admin home shortcut:** the Payment records card linked to the retired `/dashboard/teams/finance` route and visibly returned 404. It now opens `/dashboard/finance`, matching the working sidebar destination.

## Browser coverage

| Identity | Views and behaviors inspected |
| --- | --- |
| Admin | Password sign-in; operations dashboard; booking queue and booking detail; payment/rider-assignment tab keyboard controls; rider/customer directories; payment records; CS roster/audit; Safety roster/audit; reports; global audit; notifications; account; staff picker; decision form and draft recovery |
| Customer Support | Own workspace/navigation; inbox; claimed conversation; reply/status drafts; refresh warning; leave/cancel/restore; booking lookup; own handoff tracking; knowledge resources; Back/Forward navigation; staff switching |
| Support Supervisor | Own workspace/navigation; workload and staff queues; inbox and assignment options; escalation status filter; owned case with recommendation/resolution controls; Back/Forward navigation; staff switching |
| Safety | Own workspace/navigation; application list; claimed rider checklist; correction draft; arrow-key stage tabs; orientation schedule fields; service prerequisites/disabled approval; explicit service-selection recovery; case queue/detail; knowledge resources; Back/Forward navigation; return to original Admin |

Layouts were inspected at **1440×1000**, **390×844**, **320×740** and **1024×768** as appropriate. Screenshots and document bounds were captured across the views. Phone tables convert to labeled cards where implemented. Wide reports and the horizontal rider checklist remain inside their scrolling containers; this is distinct from whole-page overflow. Desktop and mobile screenshots were visually inspected, including dense queues, conversation forms, audit cards, workload, reports and service prerequisites.

## Keyboard and history results

- Skip to content moved focus to `main-content`.
- Links and staff cards could be opened with Enter. Arrow keys changed booking/application tabs and moved focus to the selected tab.
- Mobile drawer Escape closed the drawer and restored focus to Open navigation. The repaired first/last focus wrapping was directly verified.
- Unsaved-work dialogs listed the edited fields. Stay here and Escape retained values. Continue navigated, and explicit Restore draft recovered them.
- A Customer Support reply and status selection survived toolbar refresh and restored independently after leaving/reopening the conversation.
- Safety correction text survived switching between review and orientation tabs. Restored service selections did not bypass orientation/assessment approval gates.
- Back/Forward returned to the expected queues/details for Admin, CS, Supervisor and Safety. In this browser, Back from an unsaved Admin decision proceeded without a cancelable prompt; Forward offered the saved draft and recovered the exact text. Universal Back/Forward cancellation is **not** claimed. Browser-native/noncancelable traversal falls back to persistent recovery.
- With the mobile drawer open behind the unsaved-work dialog, Tab remained on the dialog's Continue control after the fix.

## Validation and boundaries

**165 automated checks passed**, including the new regression for layout rectangles on descendants of collapsed details. TypeScript and production webpack build passed. The three repairs are verified against the built portal, with post-deployment live rechecks recorded in the task's browser evidence.

No approval, rejection, service activation, booking cancellation, payment correction, account restriction, assignment, customer reply, email or push message was submitted. Temporary draft text/selections were cleared or reverted. Authentication and authorized staff switching created their normal session/audit records. The walkthrough validates navigation, presentation and draft interactions; server mutation correctness remains covered by the existing automated and disposable-database workflow checks. No claim of physical-device or cross-browser coverage is made.

Evidence is stored locally under `tmp/browser-audit-2026-10-31/`, including screenshots, `checks.json`, regression output and build output. Files in this ignored directory are not deployed or committed with private account data.
