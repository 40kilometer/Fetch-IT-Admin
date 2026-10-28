# Fetch Staff Portal

This app now serves individual staff accounts at one URL. Navigation is filtered by role, and pages/API handlers independently verify the current database role and revocable session.

| Role | Work | Restricted actions |
|---|---|---|
| Support Staff | Claim unassigned requests, assigned conversations, public replies, private notes, relevant booking lookup, escalation | No global booking export, Finance/Safety evidence, account bans, staff roles or pricing |
| Support Supervisor | Support queues, assignment/workload, quality notes, knowledge/templates and support escalation management | No Finance/Safety evidence unless separately authorized through the Admin role; no staff-role or platform changes |
| Finance Staff | Payment records and financial case investigation/recommendations | No real transfers, customer/rider restrictions, platform commission changes or self approval |
| Safety Review Staff | Assigned rider applications, direct document approval, orientation, assessment, activation, and safety case evidence/recommendations | No direct customer/rider bans, pricing or staff management |
| Admin | Operational booking/customer/rider tools, support and review queues, independent approvals, reports and operational audit | No owner accounts/keys, staff-role management or platform settings |
| Superadmin | Separate `fetch-superadmin` console; owner controls and inherited operations | Requires separate approved passkey authentication |

Case workflow: claim → append evidence → recommend → a different Admin/owner approves or rejects → perform any permitted intervention → record resolution. Approval itself does not move funds or automatically restrict an account. Finance accounting remains simulated.

Rider applications use direct document approval: Admin or the assigned Safety reviewer can approve an accepted checklist and schedule orientation without a separate recommendation or second approver. Service approval and rejection unlock after the scheduled orientation time and a recorded result: a pass permits approval, while failure or absence permits a reasoned rejection. Force approval requires a reason and accepted documents. Safety requests enter `FORCE_APPROVAL_PENDING` without granting services; Admin can approve or reject the exact recorded request. An Admin can force-approve directly. Request IDs and application versions prevent stale or changed requests from being applied. Every decision remains in the application audit history and Admin's Safety audit logs; reopening stays Admin-only. Demo applications never receive real service grants.

The demo picker uses the existing real CS, Supervisor, Finance and Safety accounts. Sign in once with one of these designated demo staff accounts to switch between staff with one click; Admin authentication is only needed for the Admin role. Each workspace shows the selected account's actual name and email, and audit actions use that account's ID. Ordinary staff accounts cannot unlock role switching. Demo-controller and child sessions remain revocable and expire within one hour.

Existing Admin accounts keep the Admin role. Move trusted ownership responsibilities to a separate approved Superadmin identity; do not convert customer/rider/owner identities by editing their role. Staff role changes revoke existing staff sessions.

Before deployment, apply the canonical customer migration and provision restricted database credentials as described in `fetch-superadmin/README.md`. Set a unique `ADMIN_SESSION_SECRET`; previous cookies without a persisted StaffSession are intentionally invalid. Existing staff sign in again.

The app does not create Vercel projects or apply production migrations automatically. Rider-originated support submission and real payment-provider integration are outside this implementation.
