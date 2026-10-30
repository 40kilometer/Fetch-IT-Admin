# Decision saves and logout feedback

## Changes

- Single-item application reviews return the rows written by their transaction rather than loading the whole application, documents, event history and email history a second time. Both application/user locks, ownership checks, version conflicts, document validation and transactional audit writes remain authoritative. The returned document, application version and audit event come from database write results.
- Correction, orientation, rejection and activation emails are committed as PENDING outbox rows alongside the action. Next.js `after()` performs the existing atomic-claim sender after the response. SMTP and orientation-PDF generation no longer delay a successful decision response. The application poll updates email history afterwards. A failed background attempt cannot turn an already committed decision into an apparent failed save; pending/failed/uncertain messages remain visible for the existing explicit retry flow. Explicit email retries retain their existing synchronous delivery feedback. This is not a new durable queue worker; a terminated attempt still requires the recorded retry/reconciliation flow.
- Staff API responses include `Server-Timing` for authentication, action and total handler time, plus an `X-Request-ID`. Mutations exceeding two seconds log those timings and status with the request ID. Logs contain no form contents, identity values, email addresses, credentials or record IDs.
- Logout shows **Logging out…**, disables repeated clicks immediately, and exposes a retryable connection error. It broadcasts a session change only after a confirmed result. Successful logout bypasses a redundant unfinished-draft browser warning after the existing confirmation. If server cleanup fails after authentication cookies have been cleared, the sign-in page explains that this browser is signed out but server cleanup could not be confirmed.

## Evidence

- **160 automated tests passed**, including blocked/delayed/failed logout, cancellation, cookie-clear partial failures, detached delivery, email-failure isolation, timing headers, one-snapshot review responses, permissions and existing workflow regressions.
- TypeScript and the production webpack build passed.
- **Six Postgres workflow checks passed** in a fresh random schema. The schema was removed afterwards. No production business rows or outbound messages were changed.
- Eight alternating old/new Postgres item-review measurements used the same disposable application and connection. Every returned result matched a fresh persisted application detail read, including event history. Old timings: **713, 670, 675, 695 ms**; optimized: **481, 490, 499, 489 ms**. Mean transaction/service duration fell from **688 to 490 ms (29%)**; query count fell from **17 to 12**. These are local-to-database measurements, not a promise of the same percentage reduction in every browser save.
- Before deployment, three deliberately stale live save requests returned 409 in **118, 97 and 104 ms**, with no business writes. The existing Safety account was signed out after measurement. Post-deployment checks verify timing headers, stale-version protection and logout against the live site.
- Real email/push delivery testing remains assigned to the user. No test recipients or devices were contacted.
