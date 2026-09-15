"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const COLORS = {
  orange: "#ea580c",
  green: "#16a34a",
  red: "#dc2626",
  amber: "#d97706",
  blue: "#2563eb",
  gray: "#78716c",
  border: "#e7e2d8",
  text: "#1c1917",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#9ca3af",
  ACCEPTED: COLORS.blue,
  PICKED_UP: "#7c3aed",
  IN_TRANSIT: COLORS.amber,
  DELIVERED: COLORS.green,
  CANCELLED: COLORS.red,
};

export type DayPoint = { date: string; label: string; bookings: number; revenue: number };
export type StatusPoint = { status: string; label: string; count: number };
export type VehiclePoint = { vehicleClass: string; label: string; count: number };

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 16px", color: COLORS.text }}>{title}</p>
      {children}
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  fontSize: 13,
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
};

export function DashboardCharts({
  days,
  statusBreakdown,
  vehicleBreakdown,
}: {
  days: DayPoint[];
  statusBreakdown: StatusPoint[];
  vehicleBreakdown: VehiclePoint[];
}) {
  const hasStatusData = statusBreakdown.some((s) => s.count > 0);
  const hasVehicleData = vehicleBreakdown.some((v) => v.count > 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, marginTop: 16 }}>
      <ChartCard title="Bookings — last 14 days">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={days} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="bookingsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.orange} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLORS.orange} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={COLORS.border} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: COLORS.gray }}
              axisLine={{ stroke: COLORS.border }}
              tickLine={false}
              interval={1}
            />
            <YAxis tick={{ fontSize: 11, fill: COLORS.gray }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              type="monotone"
              dataKey="bookings"
              name="Bookings"
              stroke={COLORS.orange}
              strokeWidth={2}
              fill="url(#bookingsFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Bookings by status">
        {hasStatusData ? (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusBreakdown} dataKey="count" nameKey="label" innerRadius={44} outerRadius={72} paddingAngle={2}>
                {statusBreakdown.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? COLORS.gray} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, color: COLORS.text }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState height={220} />
        )}
      </ChartCard>

      <ChartCard title="Revenue — last 14 days (delivered)">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={days} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid stroke={COLORS.border} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: COLORS.gray }}
              axisLine={{ stroke: COLORS.border }}
              tickLine={false}
              interval={1}
            />
            <YAxis
              tick={{ fontSize: 11, fill: COLORS.gray }}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={(v: number) => `₱${v}`}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₱${v.toFixed(2)}`, "Revenue"]} />
            <Bar dataKey="revenue" name="Revenue" fill={COLORS.green} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Bookings by vehicle class">
        {hasVehicleData ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={vehicleBreakdown} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 0 }}>
              <CartesianGrid stroke={COLORS.border} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: COLORS.gray }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 12, fill: COLORS.text }}
                axisLine={false}
                tickLine={false}
                width={90}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" name="Bookings" fill={COLORS.blue} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState height={200} />
        )}
      </ChartCard>
    </div>
  );
}

function EmptyState({ height }: { height: number }) {
  return (
    <div style={{ height, display: "grid", placeItems: "center", color: COLORS.gray, fontSize: 13 }}>
      No data yet
    </div>
  );
}