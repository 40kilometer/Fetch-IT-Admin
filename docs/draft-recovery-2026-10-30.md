# Staff draft recovery and session feedback

Staff can recover unfinished support replies, case decision reasons, rider document correction reasons, assessment notes, and rider service decision reasons after navigating away or reopening the portal. Drafts belong to the signed-in account, role, record, and action. They are saved on the current browser only; they do not synchronize across devices.

Recovery is explicit: the form offers **Restore draft** and **Discard draft**. Restoring a draft does not submit an action. A changed record displays a warning to review the latest details. The expanded release also recovers editable form selections, orientation schedules and assessment choices; see [expanded protection](unsaved-work-2026-10-30.md). Hidden concurrency versions, credentials and passwords are never restored from storage. Successful submissions clear their drafts; failed submissions retain them.

Drafts expire 24 hours after their last edit. Expired entries are unavailable for restoration and are removed on the next portal visit. Browser storage can be cleared by the user; it is not a server backup. Unsubmitted text remains on this browser until discarded, successfully submitted, expired and cleaned up, or browser data is cleared. Staff should avoid entering unnecessary personal information into free-text notes, particularly on shared computers.

Navigation links and browser reload/close warn when a mounted form has unfinished work. Account changes still replace the entire role workspace, while account-scoped drafts remain recoverable after returning to the original account. The expanded release covers toolbar refresh, staff switching and cancelable browser history traversal. Drafts remain recoverable when the browser does not allow traversal cancellation.

Session checks display a warning five minutes before expiry. An expired session leaves the current form mounted and provides a sign-in link back to the same record. This does not extend the session or bypass server authorization. After signing in to the same account, staff can restore the draft and review it before saving.

## Initial text-draft release validation

- 155 automated checks passed, including account/role/record isolation, 24-hour expiry, explicit restore, changed-record warnings, unavailable browser storage, navigation guard cleanup, session expiry/recovery, and safe return paths.
- TypeScript and the production webpack build passed.
- Browser verification passed on the built site: typing showed the local-save status, reopening the same review offered explicit recovery with a blank form, and restoring recovered the exact text. The test text was then cleared without submitting an approval or customer message. Browser automation could not accept the native leave confirmation; the guard behavior is covered by automated tests.
- Email and push delivery testing is reserved for the user, as requested.
