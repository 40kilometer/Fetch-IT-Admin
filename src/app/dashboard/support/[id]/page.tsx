import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaffPage } from "@/lib/staff-access";
import { supportScope, hasPermission } from "@/lib/staff-policy";
import { humanize, queryValue, type SearchParams } from "@/lib/admin-ui";
import { pageNumber } from "@/lib/operations";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Pager, StateBadge } from "@/components/admin-ui";
import { ReplyForm } from "../reply-form";
import { MessageThread } from "@/components/message-thread";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const staff = await requireStaffPage("support"), { id } = await params, query = await searchParams;
  const ticket = await db.supportTicket.findFirst({ where: { id, ...supportScope(staff) }, include: { customer: { select: { name: true, email: true } }, booking: { select: { id: true, refCode: true } } } }); if (!ticket) notFound();
  const [admins, messageTotal, noteTotal, history] = await Promise.all([
    db.user.findMany({ where: { role: { in: ["ADMIN", "SUPPORT", "SUPPORT_SUPERVISOR"] }, isBanned: false, ...(!hasPermission(staff.role, "support.manage") ? { id: staff.id } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.supportMessage.count({ where: { ticketId: id } }), db.supportInternalNote.count({ where: { ticketId: id } }),
    db.supportTicket.findMany({ where: { AND: [supportScope(staff), { customerId: ticket.customerId }] }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true, category: true, status: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(messageTotal / 50)), notePages = Math.max(1, Math.ceil(noteTotal / 25));
  const page = Math.min(pageNumber(queryValue(query, "page")), pages), notePage = Math.min(pageNumber(queryValue(query, "notes")), notePages);
  const [messages, notes] = await Promise.all([
    db.supportMessage.findMany({ where: { ticketId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, skip: (page - 1) * 50 }),
    db.supportInternalNote.findMany({ where: { ticketId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 25, skip: (notePage - 1) * 25 }),
  ]);
  const href = (messagePage: number, notesPage: number, anchor: string) => `/dashboard/support/${id}?page=${messagePage}&notes=${notesPage}#${anchor}`;
  const stamp = (date: Date) => date.toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  return <div><Link className="back-link" href="/dashboard/support">← Support inbox</Link><PageHeader eyebrow="Support conversation" title={ticket.booking?.refCode ?? "Account help"} description={`${ticket.customer.name} · ${ticket.customer.email}`}><div className="row-actions"><StateBadge value={ticket.status} />{ticket.booking && <Link className="btn" href={hasPermission(staff.role, "operations") ? `/dashboard/bookings/${ticket.booking.id}` : `/dashboard/lookup?ref=${encodeURIComponent(ticket.booking.refCode)}`}>View booking</Link>}</div></PageHeader>
    <div className="detail-grid support-detail"><section className="card conversation" id="conversation"><h2>Conversation</h2><p className="muted small">All times use Philippine time. {page === 1 ? "Showing the latest messages." : "Showing earlier messages."}</p><details className="original-request" open={messageTotal === 0}><summary>Original request · {stamp(ticket.createdAt)}</summary><article className="conversation-message"><strong>{ticket.customer.name}</strong><p>{ticket.message}</p></article></details><MessageThread latest={page === 1} pageKey={`${id}:${page}:${messages[0]?.id ?? ""}`} label="Conversation messages">{messages.toReversed().map(m => <article className={`conversation-message ${m.authorRole === "CUSTOMER" ? "" : "admin-message"}`} key={m.id}><strong>{m.authorName} · {m.authorRole === "CUSTOMER" ? "Customer" : "Support"}</strong><time dateTime={m.createdAt.toISOString()}>{stamp(m.createdAt)}</time><p>{m.body}</p></article>)}</MessageThread><Pager page={page} pages={pages} total={messageTotal} noun="messages" previousLabel="Newer messages" nextLabel="Earlier messages" href={next => href(next, notePage, "conversation")} />{page > 1 && <Link className="text-link" href={href(1, notePage, "conversation")}>Jump to latest messages →</Link>}</section>
    <section className="card conversation"><h2>Manage request</h2><ReplyForm key={id} id={id} status={ticket.status} priority={ticket.priority} assignedAdminId={ticket.assignedAdminId} updatedAt={ticket.updatedAt.toISOString()} admins={admins} recipient={ticket.customer.name} staffId={staff.id} canManage={hasPermission(staff.role, "support.manage")} /></section></div>
    <section id="internal-notes" className="card conversation section-block"><h2>Internal notes & coaching</h2><p className="muted">Visible only to staff. These notes are never sent to the customer.</p><MessageThread latest={notePage === 1} pageKey={`${id}:${notePage}:${notes[0]?.id ?? ""}`} label="Internal notes">{notes.toReversed().map(n => <article className="conversation-message" key={n.id}><strong>{n.authorName}</strong><time dateTime={n.createdAt.toISOString()}>{stamp(n.createdAt)}</time><p className="preserve-lines">{n.body}</p></article>)}</MessageThread>{!noteTotal && <p className="muted">No internal notes yet.</p>}<Pager page={notePage} pages={notePages} total={noteTotal} noun="internal notes" previousLabel="Newer notes" nextLabel="Earlier notes" href={next => href(page, next, "internal-notes")} /><ActionForm url={`/api/support/${id}/notes`} label="Append internal note" fields={[{ name: "note", label: "Internal note / coaching feedback", type: "textarea", required: true }]} /></section>
    <details className="section-block"><summary className="btn">Escalate for review</summary><ActionForm url="/api/cases" hidden={{ ticketId: id }} label="Send to review queue" fields={[{ name: "kind", label: "Team", options: [{ value: "ESCALATION", label: "Support Supervisor / Admin" }, { value: "FINANCE", label: "Finance review" }, { value: "SAFETY", label: "Safety review" }] }, { name: "title", label: "Case title", required: true }, { name: "summary", label: "Reported facts", type: "textarea", required: true }, { name: "priority", label: "Priority", value: "NORMAL", options: ["NORMAL", "HIGH", "URGENT"].map(value => ({ value, label: humanize(value) })) }]} /></details>
    <section className="card conversation section-block"><h2>Recent accessible support history</h2><p className="muted small">Latest 15 requests. Search the support inbox for older requests.</p>{history.map(t => <p key={t.id}><Link className="text-link" href={`/dashboard/support/${t.id}`}>{humanize(t.category)} · <StateBadge value={t.status} /></Link></p>)}<p className="muted small">Request ID: {id}</p></section>
  </div>;
}
