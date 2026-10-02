import Link from "next/link";
import { db } from "@/lib/db";
import { BOOKING_STATUS_LABEL, BOOKING_TYPE_LABEL } from "@/lib/constants";
import { bookingWhere, bookingQuery, pageNumber, PAGE_SIZE, normalizeFilters, type BookingFilters } from "@/lib/operations";
import { StatusBadge } from "../status-badge";

export default async function BookingsPage({ searchParams }: { searchParams: Promise<BookingFilters> }) {
  const filters = normalizeFilters(await searchParams);
  let error = "";
  let where;
  try { where = bookingWhere(filters); } catch (e) { error = e instanceof Error ? e.message : "Choose valid filters."; }
  const total = error ? 0 : await db.booking.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pageNumber(filters.page), pages);
  const bookings = error ? [] : await db.booking.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE, include: { customer: { select: { name: true } }, rider: { select: { name: true } } } });
  const attention = filters.attention === "unassigned" ? "Waiting for a rider over 5 minutes" : filters.attention === "stalled" ? "No booking update for 30 minutes" : "";
  return <div>
    <div className="page-heading"><div><div className="eyebrow">BOOKING MANAGEMENT</div><h1>Bookings</h1><p className="muted small">Find a booking, review its progress, and resolve exceptions.</p></div><a className="btn" href={`/api/bookings/export?${bookingQuery(filters)}`}>Export CSV</a></div>
    {attention && <p className="muted small">Attention filter: {attention}. <Link href="/dashboard/bookings">Show all bookings →</Link></p>}
    <form className="card filters">
      {attention && <input type="hidden" name="attention" value={filters.attention} />}
      <label>Search bookings<input className="input" name="q" defaultValue={filters.q} placeholder="Reference or address" maxLength={100} /></label>
      <label>Status<select className="input" name="status" defaultValue={filters.status ?? ""}><option value="">All statuses</option>{Object.entries(BOOKING_STATUS_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Service<select className="input" name="type" defaultValue={filters.type ?? ""}><option value="">All services</option><option value="DELIVERY">Delivery</option><option value="RIDE">Ride</option></select></label>
      <label>From date<input className="input" type="date" name="from" defaultValue={filters.from} /></label>
      <label>To date<input className="input" type="date" name="to" defaultValue={filters.to} /></label>
      <div className="filter-actions"><button className="btn btn-primary" type="submit">Apply filters</button><Link className="btn" href="/dashboard/bookings">Clear</Link><p className="muted small">Booking dates use Philippine time. CSV includes up to 5,000 matches.</p></div>
    </form>
    {error && <p className="error-message" role="alert">{error}</p>}
    {!bookings.length && !error && <div className="card empty-state">No bookings match these filters.</div>}
    {bookings.length > 0 && <>
      <div className="card table-card booking-desktop-table"><table><thead><tr><th>Reference</th><th>Service</th><th>Customer / Rider</th><th>Destination</th><th>Status</th><th>Fare</th><th></th></tr></thead><tbody>{bookings.map(b => <tr key={b.id}><td><strong>{b.refCode}</strong><div className="muted small">{b.createdAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</div></td><td>{BOOKING_TYPE_LABEL[b.type]}</td><td>{b.customer.name}<div className="muted small">{b.rider?.name ?? "No rider assigned"}</div></td><td className="booking-route"><span title={b.dropoffLabel}>{b.dropoffLabel}</span></td><td><StatusBadge status={b.status} /></td><td>₱{b.totalFare.toFixed(2)}</td><td><Link className="btn" href={`/dashboard/bookings/${b.id}`} aria-label={`View ${b.refCode}`}>View</Link></td></tr>)}</tbody></table></div>
      <div className="booking-mobile-list">{bookings.map(b => <Link className="card booking-mobile-card" key={b.id} href={`/dashboard/bookings/${b.id}`} aria-label={`View ${b.refCode}, ${b.dropoffLabel}`}><div className="booking-card-header"><strong>{b.refCode}</strong><StatusBadge status={b.status} /></div><p>{b.dropoffLabel}</p><div className="booking-card-footer"><span className="muted">{BOOKING_TYPE_LABEL[b.type]} · {b.customer.name}</span><strong>₱{b.totalFare.toFixed(2)} →</strong></div></Link>)}</div>
    </>}
    {!error && <div className="pagination"><span className="muted">{total ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE,total)} of ${total} bookings` : "0 bookings"}</span><nav aria-label="Booking pages">{page > 1 ? <Link className="btn" href={`/dashboard/bookings?${bookingQuery(filters,page - 1)}`}>Previous</Link> : <span className="btn disabled-link" aria-disabled="true">Previous</span>}<span>Page {page} of {pages}</span>{page < pages ? <Link className="btn" href={`/dashboard/bookings?${bookingQuery(filters,page + 1)}`}>Next</Link> : <span className="btn disabled-link" aria-disabled="true">Next</span>}</nav></div>}
  </div>;
}
