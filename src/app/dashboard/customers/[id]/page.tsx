import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-access";
import { PAGE_SIZE, pageNumber } from "@/lib/operations";
import { humanize, queryValue, type SearchParams } from "@/lib/admin-ui";
import { PageHeader, Pager, StateBadge } from "@/components/admin-ui";
import { StatusBadge } from "../../status-badge";
import { BanButton } from "../../ban-button";
export default async function CustomerProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  await requireAdminPage();
  const { id } = await params, query = await searchParams;
  const customer = await db.user.findUnique({ where: { id }, select: { id: true, role: true, name: true, email: true, phone: true, createdAt: true, isBanned: true, banReason: true, bannedAt: true } });
  if (!customer || customer.role !== "CUSTOMER") notFound();
  const [total, supportTotal] = await Promise.all([db.booking.count({ where: { customerId: id } }), db.supportTicket.count({ where: { customerId: id } })]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), supportPages = Math.max(1, Math.ceil(supportTotal / PAGE_SIZE));
  const page = Math.min(pageNumber(queryValue(query, "page")), pages), supportPage = Math.min(pageNumber(queryValue(query, "supportPage")), supportPages);
  const [bookings, tickets] = await Promise.all([
    db.booking.findMany({ where: { customerId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    db.supportTicket.findMany({ where: { customerId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: PAGE_SIZE, skip: (supportPage - 1) * PAGE_SIZE }),
  ]);
  const href = (bookingPage: number, ticketPage: number, anchor: string) => `/dashboard/customers/${id}?page=${bookingPage}&supportPage=${ticketPage}#${anchor}`;
  return <div><Link className="back-link" href="/dashboard/customers">← Customers</Link><PageHeader eyebrow="Customer profile" title={customer.name} description={`${customer.email} · ${customer.phone ?? "No phone supplied"}`}><BanButton userId={id} name={customer.name} isBanned={customer.isBanned} /></PageHeader>
    <section className="card conversation"><span className={`badge badge-${customer.isBanned ? "red" : "green"}`}>{customer.isBanned ? "Restricted" : "Active"}</span><p>Joined {customer.createdAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })} · {total} bookings · {supportTotal} support requests</p>{customer.banReason && <p className="error-message">Restriction reason: {customer.banReason}</p>}<Link className="text-link" href={`/dashboard/audit?q=${encodeURIComponent(id)}`}>View account restriction and restoration history →</Link></section>
    <section id="customer-bookings" className="section-block"><h2>Booking history</h2><div className="card table-card"><table className="responsive-table"><thead><tr><th>Reference</th><th>Destination</th><th>Status</th><th>Fare</th></tr></thead><tbody>{bookings.map(b => <tr key={b.id}><td data-label="Reference"><Link className="text-link" href={`/dashboard/bookings/${b.id}`}>{b.refCode}</Link><div className="muted small">{b.createdAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</div></td><td data-label="Destination">{b.dropoffLabel}</td><td data-label="Status"><StatusBadge status={b.status} /></td><td data-label="Fare">₱{b.totalFare.toFixed(2)}</td></tr>)}</tbody></table>{!total && <p className="empty-state">No bookings yet.</p>}</div><Pager page={page} pages={pages} total={total} noun="bookings" href={next => href(next, supportPage, "customer-bookings")} /></section>
    <section id="customer-support" className="section-block"><h2>Support history</h2><div className="ticket-list">{tickets.map(t => <Link key={t.id} href={`/dashboard/support/${t.id}`} className="card ticket-row"><div><strong>{humanize(t.category)}</strong><p className="ticket-preview">{t.message}</p></div><StateBadge value={t.status} /></Link>)}</div>{!supportTotal && <p className="card empty-state">No support requests yet.</p>}<Pager page={supportPage} pages={supportPages} total={supportTotal} noun="support requests" href={next => href(page, next, "customer-support")} /></section>
  </div>;
}
