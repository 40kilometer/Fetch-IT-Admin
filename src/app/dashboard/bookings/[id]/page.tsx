import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { StatusBadge } from "../../status-badge";
import { VEHICLE_LABEL } from "@/lib/constants";
import { CancelButton } from "./cancel-button";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text-muted)", fontSize: 14 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const booking = await db.booking.findUnique({
    where: { id },
    include: { customer: true, rider: true },
  });
  if (!booking) notFound();

  const isFinal = booking.status === "DELIVERED" || booking.status === "CANCELLED";

  return (
    <div>
      <Link href="/dashboard/bookings" style={{ fontSize: 14, color: "var(--text-muted)" }}>← Back to bookings</Link>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "12px 0 20px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{booking.refCode}</h1>
        <StatusBadge status={booking.status} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginTop: 0 }}>Route</h2>
          <Row label="Pickup" value={booking.pickupLabel} />
          <Row label="Drop-off" value={booking.dropoffLabel} />
          <Row label="Distance" value={`${booking.distanceKm} km`} />
          <Row label="Vehicle" value={VEHICLE_LABEL[booking.vehicleClass] ?? booking.vehicleClass} />
          <Row label="Cargo weight" value={`${booking.cargoWeightKg} kg`} />
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginTop: 0 }}>Fare</h2>
          <Row label="Base fare" value={`$${booking.baseFare.toFixed(2)}`} />
          <Row label="Surge" value={`×${booking.surgeMultiplier.toFixed(1)}`} />
          <Row label="Total" value={`$${booking.totalFare.toFixed(2)} ${booking.currency}`} />
          <Row label="Created" value={new Date(booking.createdAt).toLocaleString()} />
          {booking.deliveredAt && <Row label="Delivered" value={new Date(booking.deliveredAt).toLocaleString()} />}
          {booking.cancelledAt && <Row label="Cancelled" value={new Date(booking.cancelledAt).toLocaleString()} />}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginTop: 0 }}>Customer</h2>
          <Row label="Name" value={booking.customer.name} />
          <Row label="Email" value={booking.customer.email} />
          <Row label="Phone" value={booking.customer.phone ?? "—"} />
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginTop: 0 }}>Rider</h2>
          {booking.rider ? (
            <>
              <Row label="Name" value={booking.rider.name} />
              <Row label="Vehicle plate" value={booking.rider.vehiclePlate ?? "—"} />
              <Row label="Rating" value={booking.rider.rating.toFixed(1)} />
            </>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No rider assigned yet.</p>
          )}
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <CancelButton bookingId={booking.id} disabled={isFinal} />
        {isFinal && (
          <span style={{ marginLeft: 10, fontSize: 13, color: "var(--text-muted)" }}>
            This booking is already {booking.status.toLowerCase()}.
          </span>
        )}
      </div>
    </div>
  );
}
