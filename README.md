# Fetch-It Admin

Operations dashboard for the Fetch-It platform — users, bookings, and platform
metrics for both **Delivery** and **Ride** products.
Next.js 16 · App Router · TypeScript · Prisma · PostgreSQL (Neon).

## What's inside

- **Overview** — totals split by product (delivery vs ride bookings), active bookings, revenue, customers, riders online, plus 14-day booking/revenue chart and status / vehicle breakdowns.
- **Bookings** — filter by status **and type** (Delivery / Ride), search by ref code or address, drill into a booking, cancel if needed.
- **Customers & Riders** — browse accounts, inspect profiles, ban/unban with reason.
- **Admin accounts** — sessions are HMAC-signed cookies (`ADMIN_SESSION_SECRET`), separate from customer/rider sessions.

## Admin operations improvements

- Overview includes matched bookings in the active count and links to attention queues: unassigned for over five minutes, assigned with no booking record update for 30 minutes, and unanswered support requests. Future scheduled bookings are excluded from booking attention queues. These flags prompt review; they do not establish a late delivery.
- The notification bell polls every 30 seconds while visible and on focus/reconnection. It shows up to 100 new bookings, cancellations, and support requests from the past seven days. Read status is per admin on this device. No background push notification service is added.
- Navigation collapses on phones. Booking lists use compact cards on mobile, with 25-row pagination and inclusive Philippine-time date filters. CSV export uses the same filters, up to 5,000 matches. Booking summaries show recorded milestone timestamps.
- Rider profiles include current assignments (up to 50), recent completed/cancelled bookings (25), recent reviews (20), and last location/profile update times.
- Support has a compact, paginated inbox with priority, assignment, status and search filters. Each request opens a conversation and management form. New admin replies are retained; the latest remains compatible with the customer's existing Booking help. Prior replies are preserved when conversation history starts. Stale/concurrent saves return 409 instead of overwriting newer changes.
- Audit log records admin cancellations with a reason, restrictions/restorations, and support changes, in the same database transaction as the action. Historical actions from before this feature are not reconstructed.
- Reports accept a date range of up to 366 days and a service filter. Outcomes are grouped by booking creation date in Philippine time, using current statuses. Completion/cancellation rates include unfinished bookings in the denominator. Completed fare totals are quoted fares, not confirmed payment collections.

### Additive database update

Customer, Rider and Admin share one schema. The customer app owns versioned migrations; from fetch-customer run `npm run db:deploy`. Do not apply the old manual SQL patches to the rebuilt schema.

It adds support priority/assignment fields, `SupportMessage`, and `AdminAudit`. Existing booking/customer data is retained.

### Verification

```powershell
node --experimental-strip-types --test tests/operations.test.mjs
npx tsc --noEmit
npm run build
```

For the opt-in database/API check, start Admin on localhost:3002 with its configured `.env`, then run with Node 24:

```powershell
$env:RUN_ADMIN_INTEGRATION='1'
node tests/operations.integration.cjs
```

The check creates disposable accounts, synthetic matched/terminal bookings (no open rider jobs), reviews, support requests and audit entries. It removes only its own fixtures. Checks cover active admin access, notification links, pagination, inclusive dates/CSV, attention queues, support assignment and reply history, stale/concurrent mutations, audits, rider profiles and reports.

## Run locally

```bash
cp .env.example .env          # fill in DATABASE_URL + ADMIN_SESSION_SECRET
npm install
npm run dev                   # http://localhost:3002
```

## Create an admin account

```bash
npm run create-admin -- you@example.com "a strong password" "Your Name"
```

Promotes the email to `ADMIN` (or creates it) using the same scrypt password
format as the rest of Fetch-It.

## Deploy to Vercel

1. Push this folder to a GitHub repo and import it in Vercel.
2. Set environment variables:
   - `DATABASE_URL` — the shared Neon PostgreSQL connection string.
   - `ADMIN_SESSION_SECRET` — any long random string (used to sign session cookies).
3. Deploy. The build runs `prisma generate && next build`.

## Database

Shared with the Fetch-It **Customer** and **Rider** apps — one PostgreSQL
schema (`prisma/schema.prisma`), one `DATABASE_URL`. Bookings created in the
customer app (including rides) appear here immediately.

## Database rebuild

The canonical schema and versioned migrations live in fetch-customer. See fetch-customer/docs/database-rebuild.md for account identities, rider records, delivery codes, GPS retention, and coordinated deployment. Set the same DELIVERY_CODE_SECRET in customer and rider environments. Configure CRON_SECRET in the rider deployment for daily tracking cleanup. External image storage is deferred.
