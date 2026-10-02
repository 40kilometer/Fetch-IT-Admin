import { db } from "@/lib/db";
import Link from "next/link";
import { ACTIVE_STATUSES, bookingWhere } from "@/lib/operations";
import { BOOKING_STATUS_LABEL, VEHICLE_LABEL } from "@/lib/constants";
import { DashboardCharts, type DayPoint, type StatusPoint, type VehiclePoint } from "./dashboard-charts";

async function getStats() {
  const [
    totalBookings,
    deliveryBookings,
    rideBookings,
    activeBookings,
    totalCustomers,
    totalRiders,
    onlineRiders,
    revenueAgg,
  ] = await Promise.all([
    db.booking.count(),
    db.booking.count({ where: { type: "DELIVERY" } }),
    db.booking.count({ where: { type: "RIDE" } }),
    db.booking.count({ where: { status: { in: ACTIVE_STATUSES } } }),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.user.count({ where: { role: "RIDER" } }),
    db.user.count({ where: { role: "RIDER", isOnline: true } }),
    db.booking.aggregate({ where: { status: "DELIVERED" }, _sum: { totalFare: true } }),
  ]);

  return {
    totalBookings,
    deliveryBookings,
    rideBookings,
    activeBookings,
    totalCustomers,
    totalRiders,
    onlineRiders,
    revenue: revenueAgg._sum.totalFare ?? 0,
  };
}

async function getChartData() {
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const since = new Date(new Date(`${today}T00:00:00+08:00`).getTime() - 13 * 86400000);

  const [recentBookings, statusGroups, vehicleGroups] = await Promise.all([
    db.booking.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, status: true, totalFare: true },
    }),
    db.booking.groupBy({ by: ["status"], _count: { _all: true } }),
    db.booking.groupBy({ by: ["vehicleClass"], _count: { _all: true } }),
  ]);

  const days: DayPoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(new Date(`${today}T00:00:00Z`).getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    days.push({
      date: key,
      label: d.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }),
      bookings: 0,
      revenue: 0,
    });
  }
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));

  for (const b of recentBookings) {
    const key = new Date(b.createdAt.getTime() + 8 * 3600000).toISOString().slice(0, 10);
    const idx = dayIndex.get(key);
    if (idx === undefined) continue;
    days[idx].bookings += 1;
    if (b.status === "DELIVERED") days[idx].revenue += b.totalFare;
  }

  const statusBreakdown: StatusPoint[] = statusGroups.map((g) => ({
    status: g.status,
    label: BOOKING_STATUS_LABEL[g.status] ?? g.status,
    count: g._count._all,
  }));

  const vehicleBreakdown: VehiclePoint[] = vehicleGroups.map((g) => ({
    vehicleClass: g.vehicleClass,
    label: VEHICLE_LABEL[g.vehicleClass] ?? g.vehicleClass,
    count: g._count._all,
  }));

  return { days, statusBreakdown, vehicleBreakdown };
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 600, margin: "6px 0 0" }}>{value}</p>
    </div>
  );
}

export default async function OverviewPage() {
  const now = new Date();
  const [stats, chartData, unassigned, stalled, support] = await Promise.all([getStats(), getChartData(),
    db.booking.count({ where: bookingWhere({ attention: "unassigned" }, now) }),
    db.booking.count({ where: bookingWhere({ attention: "stalled" }, now) }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, adminReply: null } }),
  ]);

  return (
    <div>
      <div className="page-heading"><div><div className="eyebrow">OPERATIONS OVERVIEW</div><h1>Your daily overview</h1><p className="muted small">Keep bookings moving and customers informed.</p></div><p className="muted small">As of {now.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p></div>
      <section className="card attention-panel" aria-labelledby="attention-title"><h2 id="attention-title">Needs attention</h2><p className="muted small">Review these queues before moving on to the numbers.</p><div className="attention-grid">
        <Link href="/dashboard/bookings?attention=unassigned" className="attention-item"><strong>{unassigned}</strong><span>Waiting for a rider →</span><small>Unassigned for over 5 minutes. Future scheduled bookings excluded.</small></Link>
        <Link href="/dashboard/bookings?attention=stalled" className="attention-item"><strong>{stalled}</strong><span>Check booking progress →</span><small>Assigned bookings with no record update for 30 minutes.</small></Link>
        <Link href="/dashboard/support?unanswered=1" className="attention-item"><strong>{support}</strong><span>Unanswered requests →</span><small>Open or in-progress requests awaiting an admin reply.</small></Link>
      </div></section>
      <div className="stat-grid">
        <StatCard label="Total bookings" value={stats.totalBookings} />
        <StatCard label="Delivery bookings" value={stats.deliveryBookings} />
        <StatCard label="Ride bookings" value={stats.rideBookings} />
        <StatCard label="Active bookings" value={stats.activeBookings} />
        <StatCard label="Completed fare total" value={`₱${stats.revenue.toFixed(2)}`} />
        <StatCard label="Customers" value={stats.totalCustomers} />
        <StatCard label="Riders" value={stats.totalRiders} />
        <StatCard label="Riders online now" value={stats.onlineRiders} />
      </div>

      <DashboardCharts
        days={chartData.days}
        statusBreakdown={chartData.statusBreakdown}
        vehicleBreakdown={chartData.vehicleBreakdown}
      />
    </div>
  );
}
