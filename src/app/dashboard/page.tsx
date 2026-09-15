import { db } from "@/lib/db";

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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 600, margin: "6px 0 0" }}>{value}</p>
    </div>
  );
}

export default async function OverviewPage() {
  const stats = await getStats();

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Overview</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <StatCard label="Total bookings" value={stats.totalBookings} />
        <StatCard label="Active bookings" value={stats.activeBookings} />
        <StatCard label="Total revenue" value={`$${stats.revenue.toFixed(2)}`} />
        <StatCard label="Customers" value={stats.totalCustomers} />
        <StatCard label="Riders" value={stats.totalRiders} />
        <StatCard label="Riders online now" value={stats.onlineRiders} />
      </div>
    </div>
  );
}
