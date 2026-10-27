import { hasPermission, type Permission } from "./staff-policy";

export type StaffTeam = {
  slug: string;
  label: string;
  shortLabel: string;
  description: string;
  permission: Permission;
  roles: readonly string[];
  caseKind: string;
  resourceKinds: readonly string[];
  icon: string;
};

export const STAFF_TEAMS: readonly StaffTeam[] = [
  { slug: "customer-support", label: "Customer Support", shortLabel: "CS", description: "Handle customer requests, follow up on bookings, and coordinate support escalations.", permission: "support", roles: ["SUPPORT", "SUPPORT_SUPERVISOR"], caseKind: "ESCALATION", resourceKinds: ["KNOWLEDGE", "TEMPLATE", "ANNOUNCEMENT"], icon: "support" },
  { slug: "finance", label: "Finance", shortLabel: "Finance", description: "Review payment records, investigate discrepancies, and prepare financial recommendations.", permission: "finance", roles: ["FINANCE"], caseKind: "FINANCE", resourceKinds: ["ANNOUNCEMENT"], icon: "finance" },
  { slug: "safety", label: "Safety Review", shortLabel: "Safety", description: "Review rider applications, investigate incidents, and preserve safety evidence.", permission: "safety", roles: ["SAFETY"], caseKind: "SAFETY", resourceKinds: ["SAFETY_GUIDE", "ANNOUNCEMENT"], icon: "cases" },
];

export const teamBySlug = (slug: string) => STAFF_TEAMS.find(team => team.slug === slug);
export const teamForRole = (role: string) => STAFF_TEAMS.find(team => team.roles.includes(role));
export const teamForCaseKind = (kind: string) => STAFF_TEAMS.find(team => team.caseKind === kind);
export const teamHome = (team: StaffTeam) => `/dashboard/teams/${team.slug}`;
export const teamReviews = (team: StaffTeam) => `/dashboard/cases?team=${team.slug}`;

export type StaffNavLink = { href: string; label: string; icon: string; management?: boolean };
export type StaffNavGroup = { label: string; team?: string; icon?: string; links: StaffNavLink[] };

export function staffNavigation(role: string): StaffNavGroup[] {
  const admin = hasPermission(role, "operations");
  const groups: StaffNavGroup[] = admin ? [{ label: "Operations", links: [
    { href: "/dashboard", label: "Overview", icon: "overview" },
    { href: "/dashboard/bookings", label: "Bookings", icon: "bookings" },
    { href: "/dashboard/riders", label: "Riders", icon: "riders" },
    { href: "/dashboard/customers", label: "Customers", icon: "users" },
    { href: "/dashboard/workspace", label: "My workspace", icon: "workspace" },
    { href: "/dashboard/cases", label: "All reviews", icon: "cases" },
  ] }] : [];
  for (const team of STAFF_TEAMS.filter(team => hasPermission(role, team.permission))) {
    const links: StaffNavLink[] = [{ href: teamHome(team), label: "Overview", icon: "overview" }];
    if (team.slug === "customer-support") {
      links.push({ href: "/dashboard/support", label: "Support inbox", icon: "support" }, { href: "/dashboard/lookup", label: "Booking lookup", icon: "lookup" });
      if (hasPermission(role, "support.manage")) links.push({ href: "/dashboard/team", label: "Support workload", icon: "team" });
    }
    if (team.slug === "finance") links.push({ href: "/dashboard/finance", label: "Payment records", icon: "finance" });
    if (team.slug === "safety") links.push({ href: "/dashboard/applications", label: "Rider applications", icon: "riders" });
    links.push({ href: teamReviews(team), label: team.slug === "customer-support" ? "Escalations" : `${team.shortLabel} reviews`, icon: "cases" },
      { href: `/dashboard/resources?team=${team.slug}`, label: "Knowledge & updates", icon: "resources" });
    if (admin) links.push({ href: `${teamHome(team)}/audit`, label: `${team.shortLabel} audit logs`, icon: "audit", management: true },
      { href: `${teamHome(team)}/staff`, label: `${team.shortLabel} staff`, icon: "team", management: true });
    groups.push({ label: team.label, team: team.slug, icon: team.icon, links });
  }
  if (admin) groups.push({ label: "Reporting", links: [{ href: "/dashboard/reports", label: "Reports", icon: "reports" }, { href: "/dashboard/audit", label: "All audit logs", icon: "audit" }] });
  return groups;
}

export function isStaffNavActive(href: string, pathname: string, search: { get(name: string): string | null }) {
  const [path, query] = href.split("?");
  if (path === "/dashboard" ? pathname !== path : pathname !== path && !pathname.startsWith(path + "/")) return false;
  // The team overview must not also highlight when its Staff or Audit page opens.
  if (path.startsWith("/dashboard/teams/") && path.split("/").length === 4 && pathname !== path) return false;
  const expectedTeam = new URLSearchParams(query).get("team");
  if (expectedTeam) return search.get("team") === expectedTeam;
  return path !== "/dashboard/cases" || !search.get("team");
}
