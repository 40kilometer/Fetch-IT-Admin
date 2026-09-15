import { db } from "@/lib/db";
import { BOOKING_STATUS_LABEL, VEHICLE_LABEL } from "@/lib/constants";
import { DashboardCharts, type DayPoint, type StatusPoint, type VehiclePoint } from "./dashboard-charts";

async function getStats() {
  const [totalBookings, activeBookings, totalCustomers, totalRiders, onlineRiders, revenueAgg] =
    await Promise.all([
      db.booking.count(),
      db.booking.count({ where: { status: { in: ["PENDING", "ACCEPTED", "PICKED_UP", "IN_TRANSIT"] } } }),
      db.user.count({ where: { role: "CUSTOMER" } }),
      db.user.count({ where: { role: "RIDER" } }),
      db.user.count({ where: { role: "RIDER", isOnline: true } }),
      db.booking.aggregate({ where: { status: "DELIVERED" }, _sum: { totalFare: true } }),
    ]);

  return {
    totalBookings,
    activeBookings,
    totalCustomers,
    totalRiders,
    onlineRiders,
    revenue: revenueAgg._sum.totalFare ?? 0,
  };
}

async function getChartData() {
  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);

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
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      date: key,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      bookings: 0,
      revenue: 0,
    });
  }
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));

  for (const b of recentBookings) {
    const key = b.createdAt.toISOString().slice(0, 10);
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
  const [stats, chartData] = await Promise.all([getStats(), getChartData()]);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Overview</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <StatCard label="Total bookings" value={stats.totalBookings} />
        <StatCard label="Active bookings" value={stats.activeBookings} />
        <StatCard label="Total revenue" value={`₱${stats.revenue.toFixed(2)}`} />
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