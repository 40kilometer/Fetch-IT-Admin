# Fetch-It Admin

Operations dashboard for the Fetch-It platform — users, bookings, and platform
metrics for both **Delivery** and **Ride** products.
Next.js 16 · App Router · TypeScript · Prisma · PostgreSQL (Railway).

## What's inside

- **Overview** — totals split by product (delivery vs ride bookings), active bookings, revenue, customers, riders online, plus 14-day booking/revenue chart and status / vehicle breakdowns.
- **Bookings** — filter by status **and type** (Delivery / Ride), search by ref code or address, drill into a booking, cancel if needed.
- **Customers & Riders** — browse accounts, inspect profiles, ban/unban with reason.
- **Admin accounts** — sessions are HMAC-signed cookies (`ADMIN_SESSION_SECRET`), separate from customer/rider sessions.

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
   - `DATABASE_URL` — the **public** Railway PostgreSQL connection string.
   - `ADMIN_SESSION_SECRET` — any long random string (used to sign session cookies).
3. Deploy. The build runs `prisma generate && next build`.

## Database

Shared with the Fetch-It **Customer** and **Rider** apps — one PostgreSQL
schema (`prisma/schema.prisma`), one `DATABASE_URL`. Bookings created in the
customer app (including rides) appear here immediately.
