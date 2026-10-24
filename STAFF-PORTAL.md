# Fetch Staff Portal

This app now serves individual staff accounts at one URL. Navigation is filtered by role, and pages/API handlers independently verify the current database role and revocable session.

| Role | Work | Restricted actions |
|---|---|---|
| Support Staff | Claim unassigned requests, assigned conversations, public replies, private notes, relevant booking lookup, escalation | No global booking export, Finance/Safety evidence, account bans, staff roles or pricing |
| Support Supervisor | Support queues, assignment/workload, quality notes, knowledge/templates and support escalation management | No Finance/Safety evidence unless separately authorized through the Admin role; no staff-role or platform changes |
| Finance Staff | Payment records and financial case investigation/recommendations | No real transfers, customer/rider restrictions, platform commission changes or self approval |
| Safety Review Staff | Safety case evidence and recommendations | No direct customer/rider bans, pricing or staff management |
| Admin | Operational booking/customer/rider tools, support and review queues, independent approvals, reports and operational audit | No owner accounts/keys, staff-role management or platform settings |
| Superadmin | Separate `fetch-superadmin` console; owner controls and inherited operations | Requires separate approved passkey authentication |

Case workflow: claim → append evidence → recommend → a different Admin/owner approves or rejects → perform any permitted intervention → record resolution. Approval itself does not move funds or automatically restrict an account. Finance accounting remains simulated.

Existing Admin accounts keep the Admin role. Move trusted ownership responsibilities to a separate approved Superadmin identity; do not convert customer/rider/owner identities by editing their role. Staff role changes revoke existing staff sessions.

Before deployment, apply the canonical customer migration and provision restricted database credentials as described in `fetch-superadmin/README.md`. Set a unique `ADMIN_SESSION_SECRET`; previous cookies without a persisted StaffSession are intentionally invalid. Existing staff sign in again.

The app does not create Vercel projects or apply production migrations automatically. Rider-originated support submission and real payment-provider integration are outside this implementation.
