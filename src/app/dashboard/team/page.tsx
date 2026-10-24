import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaffPage } from "@/lib/staff-access";
import { ROLE_LABELS } from "@/lib/staff-policy";
import { PageHeader } from "@/components/admin-ui";
export default async function Page() {
  await requireStaffPage("support.manage");
  const [people, counts] = await Promise.all([db.user.findMany({ where: { isBanned: false, role: { in: ["SUPPORT", "SUPPORT_SUPERVISOR", "ADMIN"] } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }), db.supportTicket.groupBy({ by: ["assignedAdminId", "status"], _count: true })]);
  return <div><PageHeader eyebrow="Customer care" title="Support team workload" description="Open a staff member’s queue to review and assign requests." /><div className="card table-card"><table className="responsive-table"><thead><tr><th>Staff member</th><th>Open / in progress</th><th>Resolved</th><th>Actions</th></tr></thead><tbody>{people.map(person => <tr key={person.id}><td data-label="Staff member">{person.name}<div className="muted small">{ROLE_LABELS[person.role]}</div></td><td data-label="Open / in progress">{counts.filter(c => c.assignedAdminId === person.id && c.status !== "RESOLVED").reduce((sum, c) => sum + c._count, 0)}</td><td data-label="Resolved">{counts.find(c => c.assignedAdminId === person.id && c.status === "RESOLVED")?._count ?? 0}</td><td data-label="Actions"><Link className="btn" href={`/dashboard/support?assigned=${encodeURIComponent(person.id)}`}>Open queue</Link></td></tr>)}</tbody></table></div><p className="muted small">Ticket totals measure workload, not customer satisfaction or response quality. Account and permission changes belong to Superadmin.</p></div>;
}
