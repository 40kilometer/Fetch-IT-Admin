import Link from "next/link";
import type { Prisma, UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTeamPage } from "@/lib/staff-team-access";
import { ROLE_LABELS } from "@/lib/staff-policy";
import { teamHome, teamReviews } from "@/lib/staff-teams";
import { queryLink, queryValue, type SearchParams } from "@/lib/admin-ui";
import { PAGE_SIZE, pageNumber } from "@/lib/operations";
import { PageHeader, Pager } from "@/components/admin-ui";

export default async function TeamStaffPage({ params, searchParams }: { params: Promise<{ team: string }>; searchParams: Promise<SearchParams> }) {
  const { team } = await requireTeamPage((await params).team, true), query = await searchParams;
  const q = queryValue(query, "q").trim().slice(0, 100), status = queryValue(query, "status");
  const where: Prisma.UserWhereInput = { role: { in: [...team.roles] as UserRole[] }, ...(status === "active" ? { isBanned: false } : status === "restricted" ? { isBanned: true } : {}), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}) };
  const total = await db.user.count({ where }), pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), page = Math.min(pageNumber(queryValue(query, "page")), pages);
  const people = await db.user.findMany({ where, select: { id: true, name: true, email: true, role: true, isBanned: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE });
  const ids = people.map(person => person.id);
  const [cases, tickets] = await Promise.all([
    db.workflowCase.groupBy({ by: ["assignedToId"], where: { kind: team.caseKind, assignedToId: { in: ids }, status: { not: "RESOLVED" } }, _count: { _all: true } }),
    team.slug === "customer-support" ? db.supportTicket.groupBy({ by: ["assignedAdminId"], where: { assignedAdminId: { in: ids }, status: { not: "RESOLVED" } }, _count: { _all: true } }) : [],
  ]);
  const base = teamHome(team) + "/staff";
  return <div><PageHeader eyebrow={`${team.label} / Team management`} title={`${team.shortLabel} staff`} description="Review existing team members, account access, and assigned work." />
    <form className="card filters directory-filters"><label>Search staff<input className="input" name="q" defaultValue={q} placeholder="Name or email" maxLength={100} /></label><label>Account status<select className="input" name="status" defaultValue={status}><option value="">All accounts</option><option value="active">Active</option><option value="restricted">Restricted</option></select></label><div className="filter-actions"><button className="btn btn-primary">Apply filters</button><Link className="btn" href={base}>Clear filters</Link></div></form>
    <div className="card table-card"><table className="responsive-table"><thead><tr><th>Staff member</th><th>Role</th><th>Account</th><th>Open reviews</th>{team.slug === "customer-support" && <th>Open requests</th>}<th>Work queues</th></tr></thead><tbody>{people.map(person => <tr key={person.id}><td data-label="Staff member">{person.name}<div className="muted small">{person.email}</div></td><td data-label="Role">{ROLE_LABELS[person.role]}</td><td data-label="Account"><span className={`badge badge-${person.isBanned ? "red" : "green"}`}>{person.isBanned ? "Restricted" : "Active"}</span></td><td data-label="Open reviews">{cases.find(group => group.assignedToId === person.id)?._count._all ?? 0}</td>{team.slug === "customer-support" && <td data-label="Open requests">{tickets.find(group => group.assignedAdminId === person.id)?._count._all ?? 0}</td>}<td data-label="Work queues"><div className="row-actions"><Link className="btn" href={`${teamReviews(team)}&assigned=${encodeURIComponent(person.id)}`}>Reviews</Link>{team.slug === "customer-support" && <Link className="btn" href={`/dashboard/support?assigned=${encodeURIComponent(person.id)}`}>Support requests</Link>}</div></td></tr>)}</tbody></table>{!total && <p className="empty-state">No {team.shortLabel} staff match these filters.</p>}</div>
    <Pager page={page} pages={pages} total={total} noun="staff members" href={next => queryLink(base, { q, status }, next)} />
  </div>;
}
