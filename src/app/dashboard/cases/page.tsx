import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaffPage } from "@/lib/staff-access";
import { caseScope, hasPermission } from "@/lib/staff-policy";
import { humanize, priorityWindows, queryLink, queryValue, type SearchParams } from "@/lib/admin-ui";
import { PAGE_SIZE, pageNumber } from "@/lib/operations";
import { PageHeader, Pager, StateBadge } from "@/components/admin-ui";
import { ActionForm } from "@/components/action-form";
import { notFound, redirect } from "next/navigation";
import { teamBySlug, teamForRole } from "@/lib/staff-teams";
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaffPage(), query = await searchParams;
  const requestedTeam = queryValue(query, "team"), ownTeam = teamForRole(staff.role);
  if (requestedTeam && !teamBySlug(requestedTeam)) notFound();
  if (ownTeam && requestedTeam && requestedTeam !== ownTeam.slug) redirect(`/dashboard/cases?team=${ownTeam.slug}`);
  const team = ownTeam ?? teamBySlug(requestedTeam);
  const q = queryValue(query, "q").trim().slice(0, 100), kind = team?.caseKind ?? queryValue(query, "kind"), priority = queryValue(query, "priority"), status = queryValue(query, "status");
  const assigned = hasPermission(staff.role, "operations") ? queryValue(query, "assigned").slice(0, 100) : "";
  const view = ["all", "mine", "unassigned", "awaiting"].includes(queryValue(query, "view")) ? queryValue(query, "view") : "open";
  const sort = ["oldest", "newest"].includes(queryValue(query, "sort")) ? queryValue(query, "sort") : "priority";
  const statuses = ["OPEN", "IN_REVIEW", "AWAITING_ADMIN", "APPROVED", "REJECTED", "RESOLVED"];
  const where: Prisma.WorkflowCaseWhereInput = { AND: [caseScope(staff),
    ...(assigned ? [{ assignedToId: assigned }] : []),
    ...(view === "mine" ? [{ assignedToId: staff.id }] : view === "unassigned" ? [{ assignedToId: null }] : []),
    ...(view === "awaiting" ? [{ status: "AWAITING_ADMIN" }] : statuses.includes(status) ? [{ status }] : view !== "all" ? [{ status: { not: "RESOLVED" } }] : []),
    ...(["ESCALATION", "FINANCE", "SAFETY"].includes(kind) ? [{ kind }] : []),
    ...(["URGENT", "HIGH", "NORMAL", "LOW"].includes(priority) ? [{ priority }] : []),
    ...(q ? [{ OR: [{ title: { contains: q, mode: "insensitive" as const } }, { id: { contains: q, mode: "insensitive" as const } }, { summary: { contains: q, mode: "insensitive" as const } }] }] : []),
  ] };
  const groups = await db.workflowCase.groupBy({ where, by: ["priority"], _count: { _all: true } });
  const total = groups.reduce((sum, group) => sum + group._count._all, 0), pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), page = Math.min(pageNumber(queryValue(query, "page")), pages);
  const records = sort === "priority" ? (await Promise.all(priorityWindows(groups.map(g => ({ priority: g.priority, count: g._count._all })), (page - 1) * PAGE_SIZE, PAGE_SIZE).map(window => db.workflowCase.findMany({ where: { AND: [where, { priority: window.priority }] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: window.skip, take: window.take })))).flat()
    : await db.workflowCase.findMany({ where, orderBy: [{ createdAt: sort === "oldest" ? "asc" : "desc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  const people = await db.user.findMany({ where: { id: { in: records.flatMap(r => r.assignedToId ? [r.assignedToId] : []) } }, select: { id: true, name: true } }), names = new Map(people.map(p => [p.id, p.name]));
  const filters = { q, kind, priority, status, view, sort, assigned, team: team?.slug }, href = (next: number) => queryLink("/dashboard/cases", filters, next);
  const kinds = team ? [team.caseKind] : ["ESCALATION", "FINANCE", "SAFETY"];
  const clear = queryLink("/dashboard/cases", { team: team?.slug });
  return <div><PageHeader eyebrow={team?.label ?? "Team reviews"} title={team ? team.slug === "customer-support" ? "Support escalations" : `${team.shortLabel} reviews` : "Reviews & escalations"} description="Find outstanding work, investigate, and track the operational decision." />
    <nav className="queue-tabs" aria-label="Review queues">{[["open", "Open"], ["mine", "Assigned to me"], ["unassigned", "Unassigned"], ["awaiting", "Awaiting approval"], ["all", "All cases"]].map(([value, label]) => <Link key={value} className={`btn ${view === value ? "btn-primary" : ""}`} aria-current={view === value ? "page" : undefined} href={queryLink("/dashboard/cases", { ...filters, view: value, status: "" })}>{label}</Link>)}</nav>
    <form key={href(1)} className="card filters"><input type="hidden" name="view" value={view} />{team && <input type="hidden" name="team" value={team.slug} />}{assigned && <input type="hidden" name="assigned" value={assigned} />}<label>Search cases<input className="input" name="q" defaultValue={q} placeholder="Title, case ID, or reported facts" maxLength={100} /></label><label>Team<select className="input" name="kind" defaultValue={kind}>{!team && <option value="">All accessible teams</option>}{kinds.map(k => <option key={k} value={k}>{humanize(k)}</option>)}</select></label><label>Priority<select name="priority" className="input" defaultValue={priority}><option value="">All priorities</option>{["URGENT", "HIGH", "NORMAL", "LOW"].map(p => <option key={p} value={p}>{humanize(p)}</option>)}</select></label><label>Status<select className="input" name="status" defaultValue={view === "awaiting" ? "AWAITING_ADMIN" : status} disabled={view === "awaiting"}><option value="">Queue default</option>{statuses.map(s => <option key={s} value={s}>{humanize(s)}</option>)}</select></label><label>Sort by<select name="sort" className="input" defaultValue={sort}><option value="priority">Highest priority, oldest first</option><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label><div className="filter-actions"><button className="btn btn-primary">Apply filters</button><Link className="btn" href={clear}>Clear filters</Link>{assigned && <p className="muted small">Showing the selected staff member’s assigned reviews.</p>}</div></form>
    <div className="card table-card"><table className="responsive-table"><thead><tr><th>Case</th><th>Team</th><th>Priority</th><th>Status</th><th>Assigned to</th><th>Opened (Philippine time)</th></tr></thead><tbody>{records.map(r => <tr key={r.id}><td data-label="Case"><Link className="text-link" href={queryLink(`/dashboard/cases/${r.id}`, { team: team?.slug })}>{r.title}</Link></td><td data-label="Team">{humanize(r.kind)}</td><td data-label="Priority"><StateBadge value={r.priority} /></td><td data-label="Status"><StateBadge value={r.status} /></td><td data-label="Assigned to">{r.assignedToId ? names.get(r.assignedToId) ?? "Staff account" : "Unassigned"}</td><td data-label="Opened">{r.createdAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</td></tr>)}</tbody></table>{!records.length && <p className="empty-state">No cases match this queue. <Link className="text-link" href={queryLink("/dashboard/cases", { team: team?.slug, view: "all" })}>View all {team ? "team" : "accessible"} cases</Link></p>}</div>
    <Pager page={page} pages={pages} total={total} noun="cases" href={href} />
    <details className="section-block" open={!!queryValue(query, "bookingRef")}><summary className="btn">Open a review</summary><p className="muted">For another team, open the support conversation and use “Escalate for review” to link it automatically.</p><ActionForm url="/api/cases" label="Submit review" fields={[{ name: "kind", label: "Team", value: kinds.includes(kind) ? kind : kinds[0], options: kinds.map(value => ({ value, label: humanize(value) })) }, { name: "title", label: "Title", required: true }, { name: "summary", label: "Issue and supporting facts", type: "textarea", required: true }, { name: "ticketId", label: "Support request ID (required when routing to another team)" }, { name: "bookingRef", label: "Booking reference (optional)", value: queryValue(query, "bookingRef").slice(0, 100) }, { name: "priority", label: "Priority", value: "NORMAL", options: ["NORMAL", "HIGH", "URGENT", "LOW"].map(value => ({ value, label: humanize(value) })) }]} /></details>
  </div>;
}
