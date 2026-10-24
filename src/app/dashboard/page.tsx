import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-access";
import { awaitingSupportReply } from "@/lib/support-queue";
import Link from "next/link";
import { ACTIVE_STATUSES, bookingWhere } from "@/lib/operations";
import { BOOKING_STATUS_LABEL, VEHICLE_LABEL } from "@/lib/constants";
import { overviewPeriod, queryValue, type SearchParams } from "@/lib/admin-ui";
import { PageHeader } from "@/components/admin-ui";
import { DashboardCharts, type DayPoint } from "./dashboard-charts";
export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminPage();
  const now = new Date(), period = overviewPeriod(queryValue(await searchParams, "period"), now), createdAt = { gte: period.since, lte: period.until };
  const [totalBookings, deliveryBookings, rideBookings, activeBookings, totalCustomers, totalRiders, onlineRiders, fares, recentBookings, statusGroups, vehicleGroups, unassigned, stalled, support] = await Promise.all([
    db.booking.count({ where: { createdAt } }), db.booking.count({ where: { createdAt, type: "DELIVERY" } }), db.booking.count({ where: { createdAt, type: "RIDE" } }),
    db.booking.count({ where: { status: { in: ACTIVE_STATUSES } } }),
    db.user.count({ where: { role: "CUSTOMER", createdAt } }), db.user.count({ where: { role: "RIDER", createdAt } }),
    db.user.count({ where: { role: "RIDER", isBanned: false, riderPresence: { is: { isOnline: true } } } }),
    db.booking.aggregate({ where: { createdAt, status: "DELIVERED" }, _sum: { totalFare: true } }),
    db.booking.findMany({ where: { createdAt }, select: { createdAt: true, status: true, totalFare: true } }),
    db.booking.groupBy({ where: { createdAt }, by: ["status"], _count: { _all: true } }),
    db.booking.groupBy({ where: { createdAt }, by: ["vehicleClass"], _count: { _all: true } }),
    db.booking.count({ where: bookingWhere({ attention: "unassigned" }, now) }), db.booking.count({ where: bookingWhere({ attention: "stalled" }, now) }), db.supportTicket.count({ where: awaitingSupportReply() }),
  ]);
  const days: DayPoint[] = Array.from({ length: period.days }, (_, index) => {
    const date = new Date(period.since.getTime() + index * 86400000), key = new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
    return { date: key, label: date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" }), bookings: 0, revenue: 0 };
  });
  const byDay = new Map(days.map(day => [day.date, day]));
  for (const booking of recentBookings) {
    const day = byDay.get(new Date(booking.createdAt.getTime() + 8 * 3600000).toISOString().slice(0, 10));
    if (day) { day.bookings++; if (booking.status === "DELIVERED") day.revenue += Number(booking.totalFare); }
  }
  return <div><PageHeader eyebrow="Operations" title="Operations overview" description="Keep bookings moving and customers informed."><p className="muted small">As of {now.toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · Philippine time</p></PageHeader>
    <section className="card attention-panel" aria-labelledby="attention-title"><h2 id="attention-title">Needs attention now</h2><p className="muted small">Live queues across all dates.</p><div className="attention-grid"><Link href="/dashboard/bookings?attention=unassigned" className="attention-item"><strong>{unassigned}</strong><span>Waiting for a rider →</span><small>Unassigned for over 5 minutes. Future scheduled bookings excluded.</small></Link><Link href="/dashboard/bookings?attention=stalled" className="attention-item"><strong>{stalled}</strong><span>Check booking progress →</span><small>Assigned bookings with no record update for 30 minutes.</small></Link><Link href="/dashboard/support?unanswered=1" className="attention-item"><strong>{support}</strong><span>Unanswered requests →</span><small>Open or in-progress requests awaiting a staff reply.</small></Link></div></section>
    <div className="section-heading"><h2>Activity · {period.label}</h2><nav className="queue-tabs" aria-label="Overview period">{[["1", "Today"], ["7", "Last 7 days"], ["30", "Last 30 days"]].map(([value, label]) => <Link className={`btn ${String(period.days) === value ? "btn-primary" : ""}`} aria-current={String(period.days) === value ? "page" : undefined} href={`/dashboard?period=${value}`} key={value}>{label}</Link>)}</nav></div>
    <p className="muted small">Bookings and new accounts created in the selected Philippine-time period, through the time shown above. Outcomes reflect current status. Completed fares are quoted fares, not confirmed collections.</p>
    <div className="stat-grid">{[["Bookings created", totalBookings], ["Delivery bookings", deliveryBookings], ["Ride bookings", rideBookings], ["Completed fare total", `₱${Number(fares._sum.totalFare ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`], ["New customers", totalCustomers], ["New riders", totalRiders]].map(([label, value]) => <div className="card staff-stat" key={label}><p className="muted">{label}</p><strong>{value}</strong></div>)}</div>
    <DashboardCharts days={days} statusBreakdown={statusGroups.map(group => ({ status: group.status, label: BOOKING_STATUS_LABEL[group.status] ?? group.status, count: group._count._all }))} vehicleBreakdown={vehicleGroups.map(group => ({ vehicleClass: group.vehicleClass, label: VEHICLE_LABEL[group.vehicleClass] ?? group.vehicleClass, count: group._count._all }))} bookingTitle={`Bookings created · ${period.label}`} fareTitle={`Completed fares by booking date · ${period.label}`} />
    <section className="section-block"><h2>Live platform status · all dates</h2><div className="live-stat-grid"><Link className="card staff-stat text-link" href="/dashboard/bookings?status=ACTIVE"><p>Active bookings now</p><strong>{activeBookings}</strong></Link><Link className="card staff-stat text-link" href="/dashboard/riders?status=online"><p>Riders online now</p><strong>{onlineRiders}</strong></Link></div></section>
  </div>;
}
