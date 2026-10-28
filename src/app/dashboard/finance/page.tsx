import Link from "next/link";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-policy";
import { db } from "@/lib/db";
import { requireStaffPage } from "@/lib/staff-access";
import { hasPermission } from "@/lib/staff-policy";
import { humanize, queryLink, queryValue, type SearchParams } from "@/lib/admin-ui";
import { PAGE_SIZE, pageNumber } from "@/lib/operations";
import { PageHeader, Pager, StateBadge } from "@/components/admin-ui";
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const staff = await requireStaffPage("finance"), query = await searchParams, ref = queryValue(query, "ref").trim().slice(0, 100), where = ref ? { refCode: ref } : {};
  const total = await db.booking.count({ where }), pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), page = Math.min(pageNumber(queryValue(query, "page")), pages);
  const bookings = await db.booking.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE, select: { id: true, refCode: true, status: true, totalFare: true, paymentMethod: true, paymentStatus: true, customerPaidAmount: true, riderReceivedAmount: true, demoCommission: true, demoRiderEarnings: true, demoPayoutAt: true } });
  return <div><PageHeader eyebrow="Finance" title="Payment records" description="Review payment records and prepare a case when intervention is needed." />
    <form key={ref} className="card filters directory-filters"><label>Exact booking reference<input name="ref" className="input" defaultValue={ref} maxLength={100} /></label><div className="filter-actions"><button className="btn btn-primary">Search</button><Link className="btn" href="/dashboard/finance">Clear filters</Link></div></form>
    <details className="data-note"><summary>Payment processing</summary><p>Online entries record payment and payout status. These controls do not transfer funds.</p></details>
    <div className="card table-card"><table className="responsive-table"><thead><tr><th>Booking</th><th>Method</th><th>Payment status</th><th>Quoted fare</th><th>Accounting record</th><th>Actions</th></tr></thead><tbody>{bookings.map(b => <tr key={b.id}><td data-label="Booking">{hasPermission(staff.role, "operations") ? <Link className="text-link" href={`/dashboard/bookings/${b.id}`}>{b.refCode}</Link> : b.refCode}<div className="muted small">{humanize(b.status)}</div></td><td data-label="Method">{PAYMENT_METHOD_LABEL[b.paymentMethod]}</td><td data-label="Payment status"><StateBadge value={b.paymentStatus} />{b.demoPayoutAt && <p className="muted small">Payout recorded</p>}</td><td data-label="Quoted fare">₱{b.totalFare.toFixed(2)}</td><td data-label="Accounting record">{b.demoCommission !== null ? <><span>Commission: ₱{b.demoCommission.toFixed(2)}</span><div>Rider earnings: ₱{b.demoRiderEarnings?.toFixed(2) ?? "—"}</div></> : <><span>Customer confirmed: {b.customerPaidAmount === null ? "—" : `₱${b.customerPaidAmount.toFixed(2)}`}</span><div>Rider confirmed: {b.riderReceivedAmount === null ? "—" : `₱${b.riderReceivedAmount.toFixed(2)}`}</div></>}</td><td data-label="Actions"><Link className="btn" href={`/dashboard/cases?team=finance&bookingRef=${encodeURIComponent(b.refCode)}`}>Prepare review</Link></td></tr>)}</tbody></table>{!total && <p className="empty-state">No payment records match this reference.</p>}</div><Pager page={page} pages={pages} total={total} noun="payment records" href={next => queryLink("/dashboard/finance", { ref }, next)} />
  </div>;
}
