import type { StaffRole } from "./staff-policy";

export const DEMO_ROLES: { role: StaffRole; label: string; description: string; icon: string }[] = [
  { role: "ADMIN", label: "Admin", description: "Operations, team oversight, staff rosters, and audit logs.", icon: "overview" },
  { role: "SUPPORT", label: "Customer Support", description: "Customer requests, booking lookup, and support escalations.", icon: "support" },
  { role: "SUPPORT_SUPERVISOR", label: "Support Supervisor", description: "Support queues, team workload, and coordination.", icon: "team" },
  { role: "FINANCE", label: "Finance", description: "Payment records and financial reviews.", icon: "finance" },
  { role: "SAFETY", label: "Safety Review", description: "Rider applications, incidents, and safety reviews.", icon: "cases" },
];
