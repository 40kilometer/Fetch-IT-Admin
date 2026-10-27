import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaffPage } from "@/lib/staff-access";
import { caseScope, hasPermission } from "@/lib/staff-policy";
import { caseActions, humanize } from "@/lib/admin-ui";
import { teamForCaseKind, teamReviews } from "@/lib/staff-teams";
import { PageHeader, StateBadge } from "@/components/admin-ui";
import { ActionForm } from "@/components/action-form";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage(), { id } = await params;
  const record = await db.workflowCase.findFirst({ where: { id, ...caseScope(staff) }, include: { notes: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } }); if (!record) notFound();
  const operations = hasPermission(staff.role, "operations"), actions = caseActions(record, { id: staff.id, operations, managesSupport: hasPermission(staff.role, "support.manage") });
  const [booking, assignees, owner] = await Promise.all([
    record.bookingId ? db.booking.findUnique({ where: { id: record.bookingId }, select: { refCode: true, type: true, status: true, totalFare: true, paymentMethod: true, paymentStatus: true, ...(record.kind === "SAFETY" ? { pickupLabel: true, dropoffLabel: true } : {}) } }) : null,
    actions.assign ? db.user.findMany({ where: { isBanned: false, role: { in: record.kind === "FINANCE" ? ["FINANCE", "ADMIN"] : record.kind === "SAFETY" ? ["SAFETY", "ADMIN"] : ["SUPPORT", "SUPPORT_SUPERVISOR", "ADMIN"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    record.assignedToId ? db.user.findUnique({ where: { id: record.assignedToId }, select: { name: true } }) : null,
  ]);
  const url = `/api/cases/${id}`, version = record.version;
  const team = teamForCaseKind(record.kind);
  const next = record.status === "RESOLVED" ? "This case is resolved. Its history is available below." : record.status === "AWAITING_ADMIN" ? actions.decide ? "Review the recommendation and record your independent decision." : "Waiting for a different administrator to review the recommendation." : record.status === "APPROVED" ? "Perform the approved intervention, then record the resolution." : !record.assignedToId ? "Claim this case or assign a reviewer to begin." : "Append evidence and submit a recommendation when the investigation is ready.";
  return <div><Link className="back-link" href={team ? teamReviews(team) : "/dashboard/cases"}>← Review queue</Link><PageHeader eyebrow={`${humanize(record.kind)} · ${humanize(record.priority)}`} title={record.title} description={`Opened by ${record.createdByName} · Assigned to ${owner?.name ?? "nobody yet"}`}><StateBadge value={record.status} /></PageHeader>
    <section className="card workflow-summary"><h2>Next step</h2><p>{next}</p><p className="muted small">Approval records a decision. Any permitted booking or account intervention must be performed separately and recorded here.</p></section>
    <section className="card conversation section-block"><h2>Reported issue</h2><p className="preserve-lines">{record.summary}</p>{booking && <><h3>Linked booking</h3><p>{booking.refCode} · {humanize(booking.type)} · {humanize(booking.status)}</p><p>₱{booking.totalFare.toFixed(2)} · {humanize(booking.paymentMethod)} · {humanize(booking.paymentStatus)}</p>{record.kind === "SAFETY" && <p>{booking.pickupLabel} → {booking.dropoffLabel}</p>}{operations && <Link className="btn" href={`/dashboard/bookings/${record.bookingId}`}>Open operational controls</Link>}</>}{record.recommendation && <><h3>Recommendation</h3><p className="preserve-lines">{record.recommendation}</p></>}{record.decision && <><h3>Admin decision</h3><p className="preserve-lines">{record.decision}</p></>}</section>
    {actions.claim && <ActionForm url={url} method="PATCH" hidden={{ action: "claim", version }} label="Claim case" />}
    {actions.assign && <ActionForm url={url} method="PATCH" hidden={{ action: "assign", version }} label="Assign reviewer" fields={[{ name: "assignedToId", label: "Reviewer", value: record.assignedToId ?? "", required: true, options: [{ value: "", label: "Choose a reviewer" }, ...assignees.map(a => ({ value: a.id, label: a.name }))] }]} />}
    {actions.note && <ActionForm url={url} method="PATCH" hidden={{ action: "note", version }} label="Append evidence" fields={[{ name: "note", label: "Internal evidence / note (preserved in history)", type: "textarea", required: true }]} />}
    {actions.recommend && <ActionForm url={url} method="PATCH" hidden={{ action: "recommend", version }} label="Submit recommendation" fields={[{ name: "recommendation", label: "Findings and recommended action", type: "textarea", required: true }]} />}
    {actions.decide && <ActionForm url={url} method="PATCH" hidden={{ action: "decide", version }} label="Record decision" confirm fields={[{ name: "outcome", label: "Decision", value: "", required: true, options: [{ value: "", label: "Choose a decision" }, { value: "APPROVED", label: "Approve recommendation" }, { value: "REJECTED", label: "Return for more review" }] }, { name: "reason", label: "Decision reason", type: "textarea", required: true }]} />}
    {actions.close && <ActionForm url={url} method="PATCH" hidden={{ action: "close", version }} label="Record resolution and close case" fields={[{ name: "reason", label: "Resolution and action/reference recorded", type: "textarea", required: true }]} />}
    <section className="card conversation section-block"><h2>Evidence & history</h2>{record.notes.map(n => <article className="conversation-message" key={n.id}><strong>{n.authorName}</strong><time dateTime={n.createdAt.toISOString()}>{n.createdAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Philippine time)</time><p className="preserve-lines">{n.body}</p></article>)}{!record.notes.length && <p className="muted">No evidence notes yet.</p>}</section>
  </div>;
}
