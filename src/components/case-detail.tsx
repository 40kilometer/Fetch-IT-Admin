import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaffPage } from "@/lib/staff-access";
import { caseScope, hasPermission, canReviewCase, caseReviewerRoles, ROLE_LABELS } from "@/lib/staff-policy";
import { reviewLabel } from "@/lib/review-queue";
import { ReviewBadge } from "./review-badge";
import { ActionForm } from "./action-form";
export async function CaseDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaffPage(), { id } = await params, query = await searchParams;
  const record = await db.workflowCase.findFirst({ where: { id, ...caseScope(staff) } }); if (!record) notFound();
  const operations = hasPermission(staff.role, "operations"), reviewer = canReviewCase(staff.role, record.kind);
  const manages = operations || record.kind === "ESCALATION" && hasPermission(staff.role, "support.manage");
  const owned = record.assignedToId === staff.id, editable = record.status !== "RESOLVED";
  const notesWhere = { caseId: id, ...(!reviewer ? { authorId: staff.id } : {}) };
  const [booking, assignees, owner, ticket, totalMessages, totalNotes] = await Promise.all([
    record.bookingId ? db.booking.findUnique({ where: { id: record.bookingId }, select: { refCode: true, type: true, status: true, totalFare: true, paymentMethod: true, paymentStatus: true, pickupLabel: true, dropoffLabel: true } }) : null,
    manages && editable ? db.user.findMany({ where: { isBanned: false, role: { in: caseReviewerRoles(record.kind) } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    record.assignedToId ? db.user.findUnique({ where: { id: record.assignedToId }, select: { name: true } }) : null,
    record.ticketId ? db.supportTicket.findUnique({ where: { id: record.ticketId }, select: { message: true, createdAt: true, customer: { select: { name: true } } } }) : null,
    record.ticketId ? db.supportMessage.count({ where: { ticketId: record.ticketId } }) : 0,
    db.workflowNote.count({ where: notesWhere }),
  ]);
  const pages = Math.max(1, Math.ceil(totalMessages / 50)), notePages = Math.max(1, Math.ceil(totalNotes / 25));
  const number = (value: unknown, max: number) => { const n = Number(value); return Math.min(Number.isSafeInteger(n) && n > 0 ? n : 1, max); };
  const page = number(query.page, pages), notePage = number(query.notes, notePages);
  const [messages, notes] = await Promise.all([
    record.ticketId ? db.supportMessage.findMany({ where: { ticketId: record.ticketId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, skip: (page - 1) * 50 }) : [],
    db.workflowNote.findMany({ where: notesWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 25, skip: (notePage - 1) * 25 }),
  ]);
  const url = `/api/cases/${id}`, version = record.version;
  const intervention = staff.role === "SUPERADMIN" ? [{ name: "reason", label: "Reason for your intervention (internal only, up to 500 characters)", type: "textarea", required: true }] : [];
  const next = !editable ? "This request is resolved. Its history is available below." : !reviewer ? "Your handoff is with the receiving team. You can add supporting information below." : record.status === "AWAITING_ADMIN" ? "An independent Admin decision is required. The review remains in progress." : record.status === "APPROVED" ? "Admin approved the recommendation. Perform the permitted action separately, then record the resolution." : record.status === "REJECTED" ? "Admin returned the recommendation. Review their feedback and submit revised findings." : !record.assignedToId ? "Claim this review to begin, or assign an eligible reviewer." : "Review the facts, add evidence, and record the next action.";
  const href = (messagePage: number, notesPage: number) => `/dashboard/cases/${id}?page=${messagePage}&notes=${notesPage}`;
  const stamp = (date: Date) => date.toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  return <div><Link className="back-link" href="/dashboard/cases">← {staff.role === "SUPPORT" ? "My escalated requests" : "Review queue"}</Link>
    <div className="page-heading"><div><div className="eyebrow">{reviewLabel(record.kind)}</div><h1>{record.title}</h1><p>Requested by {record.createdByName} · Reviewer: {owner?.name ?? "Unassigned"}</p></div><div className="row-actions">{reviewer && <ReviewBadge value={record.priority} />}<ReviewBadge value={record.status} status /></div></div>
    <section className="card conversation"><h2>Next step</h2><p>{next}</p></section>
    <section className="card conversation section-block"><h2>Internal handoff details</h2><p className="muted small">Visible to authorized staff only. These answers are not sent to the customer.</p><p className="preserve-lines">{record.summary}</p>
      {booking && <><h3>Linked booking</h3><p>{booking.refCode} · {reviewLabel(booking.type)} · {reviewLabel(booking.status)}</p><p>₱{booking.totalFare.toFixed(2)} · {reviewLabel(booking.paymentMethod)} · {reviewLabel(booking.paymentStatus)}</p>{reviewer && <p>{booking.pickupLabel} → {booking.dropoffLabel}</p>}{operations && <Link className="btn" href={`/dashboard/bookings/${record.bookingId}`}>Open operational controls</Link>}</>}
      {reviewer && record.recommendation && <><h3>Recommendation</h3><p className="preserve-lines">{record.recommendation}</p></>}{reviewer && record.decision && <><h3>Admin decision</h3><p className="preserve-lines">{record.decision}</p></>}
    </section>
    {ticket && <section className="card conversation section-block"><h2>Linked customer conversation</h2><p className="muted small">{page === 1 ? "Latest messages." : "Earlier messages."} Read-only here. Handoff notes remain internal.</p><article className="conversation-message"><strong>{ticket.customer.name} · Original request</strong><time>{stamp(ticket.createdAt)}</time><p className="preserve-lines">{ticket.message}</p></article>{messages.toReversed().map(message => <article className="conversation-message" key={message.id}><strong>{message.authorName} · {message.authorRole === "CUSTOMER" ? "Customer" : ROLE_LABELS[message.authorRole] ?? message.authorRole}</strong><time>{stamp(message.createdAt)}</time><p className="preserve-lines">{message.body}</p></article>)}<nav className="row-actions" aria-label="Conversation pages">{page > 1 && <Link className="btn" href={href(page - 1, notePage)}>Newer messages</Link>}{page < pages && <Link className="btn" href={href(page + 1, notePage)}>Earlier messages</Link>}</nav></section>}
    {editable && reviewer && (!record.assignedToId || owned && record.status === "OPEN") && <ActionForm url={url} method="PATCH" hidden={{ action: "claim", version }} label="Start review" fields={intervention} />}
    {editable && manages && <ActionForm url={url} method="PATCH" hidden={{ action: "assign", version }} label="Assign reviewer" fields={[{ name: "assignedToId", label: "Reviewer", value: record.assignedToId ?? "", required: true, options: [{ value: "", label: "Choose a reviewer" }, ...assignees.map(person => ({ value: person.id, label: person.name }))] }, ...intervention]} />}
    {editable && (owned || manages || record.createdById === staff.id) && <ActionForm url={url} method="PATCH" hidden={{ action: "note", version }} label={reviewer ? "Save internal note" : "Add supporting information"} fields={[{ name: "note", label: "Internal information (not sent to the customer)", type: "textarea", required: true }, ...intervention]} />}
    {reviewer && (owned || manages) && ["OPEN", "IN_REVIEW", "REJECTED"].includes(record.status) && <ActionForm url={url} method="PATCH" hidden={{ action: "recommend", version }} label="Request Admin decision" fields={[{ name: "recommendation", label: "Findings and recommended operational action", type: "textarea", required: true }, ...intervention]} />}
    {operations && record.status === "AWAITING_ADMIN" && record.createdById !== staff.id && !owned && <ActionForm url={url} method="PATCH" hidden={{ action: "decide", version }} label="Record decision" confirm fields={[{ name: "outcome", label: "Decision", required: true, value: "", options: [{ value: "", label: "Choose a decision" }, { value: "APPROVED", label: "Approve recommendation" }, { value: "REJECTED", label: "Return for more review" }] }, { name: "reason", label: "Decision reason", type: "textarea", required: true }]} />}
    {(manages || record.kind === "SAFETY" && owned && reviewer) && ["APPROVED", "IN_REVIEW", "OPEN"].includes(record.status) && (record.kind === "ESCALATION" || record.status === "APPROVED") && <ActionForm url={url} method="PATCH" hidden={{ action: "close", version }} label="Record resolution" fields={[{ name: "reason", label: "Resolution and action/reference recorded", type: "textarea", required: true }]} />}
    <section className="card conversation section-block"><h2>{reviewer ? "Internal evidence & history" : "Your supporting information"}</h2>{notes.toReversed().map(note => <article className="conversation-message" key={note.id}><strong>{note.authorName}</strong><time>{stamp(note.createdAt)}</time><p className="preserve-lines">{note.body}</p></article>)}{!notes.length && <p>No notes yet.</p>}<nav className="row-actions" aria-label="Internal note pages">{notePage > 1 && <Link className="btn" href={href(page, notePage - 1)}>Newer notes</Link>}{notePage < notePages && <Link className="btn" href={href(page, notePage + 1)}>Earlier notes</Link>}</nav></section>
    {reviewer && <p className="muted small">Admin approval records a decision. It does not automatically refund money or restrict an account. Perform any permitted operational action separately and record its outcome.</p>}
  </div>;
}
