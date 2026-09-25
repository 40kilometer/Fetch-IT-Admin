import Link from "next/link";
import { db } from "@/lib/db";
import { BOOKING_STATUS_LABEL, BOOKING_TYPE_LABEL } from "@/lib/constants";
import { StatusBadge } from "../status-badge";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; type?: string }>;
}) {
  const { status, q, type } = await searchParams;

  const bookings = await db.booking.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(type === "DELIVERY" || type === "RIDE" ? { type } : {}),
      ...(q
        ? {
            OR: [
              { refCode: { contains: q, mode: "insensitive" } },
              { pickupLabel: { contains: q, mode: "insensitive" } },
              { dropoffLabel: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      customer: { select: { name: true } },
      rider: { select: { name: true } },
    },
  });

  const statuses = Object.keys(BOOKING_STATUS_LABEL);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 20 }}>Bookings</h1>

      <form style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          className="input"
          name="q"
          defaultValue={q}
          placeholder="Search ref code or address…"
          style={{ maxWidth: 320 }}
        />
        <select className="input" name="status" defaultValue={status ?? ""} style={{ maxWidth: 180 }}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{BOOKING_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <select className="input" name="type" defaultValue={type ?? ""} style={{ maxWidth: 150 }}>
          <option value="">All types</option>
          <option value="DELIVERY">Delivery</option>
          <option value="RIDE">Ride</option>
        </select>
        <button type="submit" className="btn">Filter</button>
        {(status || q || type) && <Link href="/dashboard/bookings" className="btn">Clear</Link>}
      </form>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Ref</th>
              <th>Type</th>
              <th>Customer</th>
              <th>Driver</th>
              <th>Route</th>
              <th>Status</th>
              <th>Fare</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td style={{ fontWeight: 500 }}>
                  {b.refCode}
                  {b.ticketId && (
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)" }}>
                      {b.ticketId}
                    </div>
                  )}
                </td>
                <td>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      ...(b.type === "RIDE"
                        ? { background: "#d1fae5", color: "#065f46" }
                        : { background: "#fef3c7", color: "#92400e" }),
                    }}
                  >
                    {BOOKING_TYPE_LABEL[b.type] ?? b.type}
                  </span>
                </td>
                <td>{b.customer.name}</td>
                <td>{b.rider?.name ?? "—"}</td>
                <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.pickupLabel} → {b.dropoffLabel}
                </td>
                <td><StatusBadge status={b.status} /></td>
                <td>₱{b.totalFare.toFixed(2)}</td>
                <td>
                  <Link href={`/dashboard/bookings/${b.id}`} className="btn" style={{ padding: "5px 12px", fontSize: 13 }}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {bookings.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>No bookings match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
