import Link from "next/link";
import type { Prisma, SupportStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStaffPage } from "@/lib/staff-access";
import { caseScope, hasPermission, supportScope } from "@/lib/staff-policy";
import { readQueue, reviewLabel, reviewStatusWhere } from "@/lib/review-queue";
import { QueueFilters } from "./queue-filters";
import { ReviewBadge } from "./review-badge";
import { ActionForm } from "./action-form";
import { awaitingSupportReply } from "@/lib/support-queue";
import { caseNextAction, caseViewWhere } from "@/lib/workflow-presentation";
type Query = Record<string, string | string[] | undefined>;
const pageSize = 20;
function pageNumber(query: Query, pages: number) { const n = Number(query.page); return Math.min(Number.isSafeInteger(n) && n > 0 ? n : 1, pages); }
function Pagination({ total, page, pages, path, filters }: { total: number; page: number; pages: number; path: string; filters: Record<string, string> }) {
  const href = (next: number) => `${path}?${new URLSearchParams({ ...filters, page: String(next) })}`;
  return <div className="pagination"><span>{total} requests · Page {page} of {pages}</span><nav aria-label="Queue pages">{page > 1 && <Link className="btn" href={href(page - 1)}>Previous</Link>}{page < pages && <Link className="btn" href={href(page + 1)}>Next</Link>}</nav></div>;
}
export async function CasesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const staff = await requireStaffPage(), query = await searchParams;
  const operations = hasPermission(staff.role, "operations"), tracking = staff.role === "SUPPORT";
  const filters = readQueue(query, !tracking);
  const view = operations && ["decisions", "team", "close", "unassigned"].includes(String(query.view)) ? String(query.view) : "";
  const viewWhere = caseViewWhere(view, staff.id);
  const context = operations && query.team === "safety" ? "SAFETY" : operations && query.team === "customer-support" ? "ESCALATION" : "";
  const assigned = operations && typeof query.assigned === "string" ? query.assigned.slice(0,100) : "";
  const where: Prisma.WorkflowCaseWhereInput = { AND: [caseScope(staff), viewWhere ?? { status: reviewStatusWhere(filters.status) },
    ...(context ? [{kind:context}] : []), ...(assigned ? [{assignedToId:assigned}] : []),
    ...(filters.priority ? [{ priority: filters.priority }] : []),
    ...(filters.q ? [{ OR: ["title", "id", "summary"].map(key => ({ [key]: { contains: filters.q, mode: "insensitive" } })) }] : []),
  ] };
  const total = await db.workflowCase.count({ where }), pages = Math.max(1, Math.ceil(total / pageSize)), page = pageNumber(query, pages);
  const records = await db.workflowCase.findMany({ where, orderBy: [{ createdAt: filters.sort === "newest" ? "desc" : "asc" }, { id: "asc" }], take: pageSize, skip: (page - 1) * pageSize });
  const title = tracking ? "My escalated requests" : staff.role === "SAFETY" ? "Safety reviews" : operations ? "Reviews & escalations" : "Escalation queue";
  const owners = await db.user.findMany({where:{id:{in:[...new Set(records.flatMap(record=>record.assignedToId?[record.assignedToId]:[]))]}},select:{id:true,name:true}});
  const ownerNames = new Map(owners.map(owner=>[owner.id,owner.name]));
  const kinds = operations ? ["ESCALATION", "SAFETY", "FINANCE"] : staff.role === "SAFETY" ? ["SAFETY"] : ["ESCALATION"];
  return <div><div className="page-heading"><div><div className="eyebrow">{tracking ? "HANDOFF TRACKING" : "TEAM REVIEWS"}</div><h1>{title}</h1><p>{tracking ? "Track the requests you sent to your supervisor or Safety Review and add supporting information." : "Review reported facts, coordinate the next action, and record the resolution."}</p></div></div>
    {operations && <nav className="queue-tabs section-block" aria-label="Review views">{[["decisions","Needs my decision"],["team","Team working"],["close","Ready to close"],["unassigned","Unassigned"],["","Browse by status"]].map(([value,label])=><Link key={value} className={`btn ${view===value?"btn-primary":""}`} aria-current={view===value?"page":undefined} href={`/dashboard/cases?${new URLSearchParams({...filters,...(context?{team:String(query.team)}:{}),...(value?{view:value}:{})})}`}>{label}</Link>)}</nav>}
    {assigned && <p className="warning-message">Showing the selected staff member’s assigned reviews. Clear filters to return to the full queue.</p>}<QueueFilters initial={filters} priorities={!tracking} hideStatus={!!view} />
    <div className="card table-card"><table className="responsive-table"><thead><tr><th>Case</th><th>Sent to</th>{!tracking && <th>Priority</th>}<th>Status</th>{operations && <><th>Owner</th><th>Next action</th></>}<th>Opened</th></tr></thead><tbody>{records.map(record => <tr key={record.id}><td data-label="Case"><Link href={`/dashboard/cases/${record.id}`}>{record.title}</Link></td><td data-label="Sent to">{reviewLabel(record.kind)}</td>{!tracking && <td data-label="Priority"><ReviewBadge value={record.priority} /></td>}<td data-label="Status"><ReviewBadge value={record.status} status detailed={operations} /></td>{operations && <><td data-label="Owner">{ownerNames.get(record.assignedToId ?? "") ?? "Unassigned"}</td><td data-label="Next action">{caseNextAction(record)}</td></>}<td data-label="Opened">{record.createdAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</td></tr>)}</tbody></table>{!records.length && <p className="empty-state">No requests match these filters.</p>}</div>
    <Pagination total={total} page={page} pages={pages} filters={{...filters,...(view?{view}:{}),...(context?{team:String(query.team)}:{}),...(assigned?{assigned}:{})}} path="/dashboard/cases" />
    {tracking ? <p>To request help, open the customer conversation in <Link href="/dashboard/support">Support inbox</Link> and send a handoff.</p> : <details className="section-block"><summary className="btn">Open a review</summary><p>For a customer handoff, use Request supervisor help / Send to Safety Review inside the support conversation.</p><ActionForm url="/api/cases" label="Submit review" fields={[{ name: "kind", label: "Review destination", value: operations && typeof query.bookingRef === "string" ? "FINANCE" : kinds[0], options: kinds.map(value => ({ value, label: reviewLabel(value) })) }, { name: "title", label: "Title", required: true }, { name: "summary", label: "Issue and supporting facts", type: "textarea", required: true }, { name: "bookingRef", label: "Booking reference (optional)", value: typeof query.bookingRef === "string" ? query.bookingRef.slice(0,100) : "" }, { name: "priority", label: "How urgent is this?", value: "", required: true, options: [{ value: "", label: "Choose a priority" }, ...["URGENT", "HIGH", "NORMAL", "LOW"].map(value => ({ value, label: reviewLabel(value) }))] }]} /></details>}
  </div>;
}
export async function SupportPage({ searchParams }: { searchParams: Promise<Query> }) {
  const staff = await requireStaffPage("support"), query = await searchParams, filters = readQueue(query, false);
  const unanswered = query.unanswered === "1";
  const status = (filters.status === "IN_REVIEW" ? "IN_PROGRESS" : filters.status) as SupportStatus;
  const assigned = hasPermission(staff.role,"operations") && typeof query.assigned === "string" ? query.assigned.slice(0,100) : "";
  const where: Prisma.SupportTicketWhereInput = { AND: [supportScope(staff), unanswered ? awaitingSupportReply() : { status }, ...(assigned?[{assignedAdminId:assigned}]:[]), ...(filters.q ? [{ OR: [{ booking: { refCode: { contains: filters.q, mode: "insensitive" as const } } }, { customer: { name: { contains: filters.q, mode: "insensitive" as const } } }] }] : [])] };
  const total = await db.supportTicket.count({ where }), pages = Math.max(1, Math.ceil(total / pageSize)), page = pageNumber(query, pages);
  const tickets = await db.supportTicket.findMany({ where, include: { customer: { select: { name: true } }, booking: { select: { refCode: true } }, assignedAdmin: { select: { name: true } }, messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } }, orderBy: [{ createdAt: filters.sort === "newest" ? "desc" : "asc" }, { id: "asc" }], take: pageSize, skip: (page - 1) * pageSize });
  return <div><div className="page-heading"><div><div className="eyebrow">CUSTOMER CARE</div><h1>Support inbox</h1><p>Claim requests, reply to customers, and send a handoff when you need help.</p></div></div>
    {unanswered && <p className="scope-notice">Awaiting staff reply · Open and in-progress requests across all dates. <Link href="/dashboard/support">Browse all requests</Link></p>}
    <QueueFilters initial={filters} hideStatus={unanswered} searchLabel="Search requests" placeholder="Booking or customer" />
    <div className="ticket-list">{tickets.map(ticket => <Link id={`ticket-${ticket.id}`} key={ticket.id} href={`/dashboard/support/${ticket.id}`} className="card ticket-row"><div><strong>{ticket.booking?.refCode ?? "Account help"}</strong><p className="muted small">{ticket.customer.name} · {ticket.category.replaceAll("_", " ")}</p><p className="ticket-preview">{ticket.messages[0]?.body ?? ticket.message}</p>{(!ticket.lastAdminReplyAt || ticket.lastCustomerMessageAt > ticket.lastAdminReplyAt) && ticket.status !== "RESOLVED" && <span className="badge badge-amber">Awaiting reply</span>}</div><div className="ticket-meta"><ReviewBadge value={ticket.status} status /><span className="muted small">{ticket.assignedAdmin?.name ?? "Unassigned"}</span><span className="muted small">Opened {ticket.createdAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (PH)</span></div></Link>)}</div>
    {!tickets.length && <div className="card empty-state">No requests match these filters.</div>}
    <Pagination total={total} page={page} pages={pages} filters={{...filters,...(unanswered?{unanswered:"1"}:{}),...(assigned?{assigned}:{})}} path="/dashboard/support" />
  </div>;
}
