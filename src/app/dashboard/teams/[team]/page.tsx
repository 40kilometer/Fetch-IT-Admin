import Link from "next/link";
import { db } from "@/lib/db";
import { requireTeamPage } from "@/lib/staff-team-access";
import { caseScope, supportScope } from "@/lib/staff-policy";
import { staffNavigation, teamReviews } from "@/lib/staff-teams";
import { PageHeader } from "@/components/admin-ui";
import { AdminIcon } from "@/components/admin-icon";

export default async function TeamPage({ params }: { params: Promise<{ team: string }> }) {
  const { staff, team } = await requireTeamPage((await params).team);
  const scope = { AND: [caseScope(staff), { kind: team.caseKind }] };
  const [open, awaiting, mine, tickets] = await Promise.all([
    db.workflowCase.count({ where: { AND: [scope, { status: { not: "RESOLVED" } }] } }),
    db.workflowCase.count({ where: { AND: [scope, { status: "AWAITING_ADMIN" }] } }),
    db.workflowCase.count({ where: { AND: [scope, { assignedToId: staff.id, status: { not: "RESOLVED" } }] } }),
    team.slug === "customer-support" ? db.supportTicket.count({ where: { AND: [supportScope(staff), { status: { not: "RESOLVED" } }] } }) : null,
  ]);
  const tools = staffNavigation(staff.role).find(group => group.team === team.slug)?.links.filter(link => link.label !== "Overview") ?? [];
  const descriptions: Record<string, string> = {
    "Support inbox": "Read requests, reply to customers, and follow up on unresolved conversations.",
    "Booking lookup": "Find a booking linked to a support request in your accessible queue.",
    "Support workload": "Review team queues and coordinate assignments.",
    "Payment records": "Check recorded payments and prepare a review when an issue needs attention.",
    "Rider applications": "Review application documents, request corrections, and track assessments.",
    "Knowledge & updates": "Read guidance and announcements relevant to this team.",
  };
  const stats = [{ label: "Open reviews", count: open, href: teamReviews(team) }, { label: "Awaiting approval", count: awaiting, href: teamReviews(team) + "&view=awaiting" }, { label: "Assigned to you", count: mine, href: teamReviews(team) + "&view=mine" }, ...(tickets === null ? [] : [{ label: "Open support requests", count: tickets, href: "/dashboard/support?status=active" }])];
  const primary = tools.find(tool => tool.label === (team.slug === "customer-support" ? "Support inbox" : team.slug === "finance" ? "Payment records" : "Rider applications"));
  return <div><PageHeader eyebrow="Team workspace" title={team.label} description={team.description}>{primary && <Link className="btn btn-primary" href={primary.href}>{primary.label} →</Link>}</PageHeader>
    <div className="stat-grid">{stats.map(stat => <Link className="card staff-stat" href={stat.href} key={stat.label}><p>{stat.label}</p><strong>{stat.count}</strong><span className="muted small">Open queue →</span></Link>)}</div>
    <section className="section-block"><h2>Your tools</h2><div className="team-tools">{tools.filter(tool => !tool.management).map(tool => <Link className="card team-tool" href={tool.href} key={tool.href}><AdminIcon name={tool.icon} /><div><h2>{tool.label}</h2><p>{descriptions[tool.label] ?? "Investigate cases and record the next action."}</p></div><span aria-hidden="true">→</span></Link>)}</div></section>
    {tools.some(tool => tool.management) && <section className="team-management"><h2>Team management</h2><div className="team-tools">{tools.filter(tool => tool.management).map(tool => <Link className="card team-tool" href={tool.href} key={tool.href}><AdminIcon name={tool.icon} /><div><h2>{tool.label}</h2><p>{tool.icon === "audit" ? "Recorded actions and changes" : "Accounts and workload"}</p></div><span aria-hidden="true">→</span></Link>)}</div></section>}
  </div>;
}
