import { requireAdminPage } from "@/lib/admin-access";
import { BookingControls } from "./booking-controls";
import { PAYMENT_STATUS_LABEL } from "@/lib/payment-policy";
import { expireRiderOffers } from "@/lib/dispatch";
import { riderSelect } from "@/lib/db-data";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { StatusBadge } from "../../status-badge";
import { BOOKING_TYPE_LABEL, VEHICLE_LABEL } from "@/lib/constants";
import { CancelButton } from "./cancel-button";
import { BookingTimeline } from "../booking-timeline";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  await expireRiderOffers(db);
  const { id } = await params;
  const booking = await db.booking.findUnique({
    where: { id },
    include: { paymentEvents: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 }, customer: true, rider: { select: riderSelect }, events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  if (!booking) notFound();

  const isFinal = booking.status === "DELIVERED" || booking.status === "CANCELLED";
  const isRide = booking.type === "RIDE";
  const canAssign = ["PENDING", "MATCHED", "ACCEPTED"].includes(booking.status) && !booking.pickedUpAt && !booking.customerPaidAt && !booking.riderReceivedAt && !["PAID", "REFUNDED"].includes(booking.paymentStatus) && (!booking.scheduledAt || booking.scheduledAt <= new Date());
  const riders = canAssign ? await db.user.findMany({ where: { role: "RIDER", isBanned: false, id: { not: booking.riderId ?? "" }, riderProfile: { vehicleClass: booking.vehicleClass }, riderPresence: { isOnline: true, updatedAt: { gte: new Date(Date.now() - 5 * 60_000) } }, bookingsAsRider: { none: { status: { in: ["MATCHED", "ACCEPTED", "PICKED_UP", "IN_TRANSIT"] } } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];

  return (
    <div>
      <Link href="/dashboard/bookings" style={{ fontSize: 14, color: "var(--text-muted)" }}>← Back to bookings</Link>
      <div className="page-heading" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{booking.refCode}</h1>
          <span
            style={{
              padding: "3px 12px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              ...(isRide
                ? { background: "#d1fae5", color: "#065f46" }
                : { background: "#fef3c7", color: "#92400e" }),
            }}
          >
            {BOOKING_TYPE_LABEL[booking.type] ?? booking.type}
          </span>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <BookingTimeline booking={booking} />
      {booking.events.length > 0 && <section className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 15 }}>Booking history</h2>
        {booking.events.map(event => <div className="detail-row" key={event.id}>
          <span>{event.createdAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</span>
          <span>{event.actorName} · {event.action.replaceAll("_", " ")} · {event.toStatus.replaceAll("_", " ")}{event.reason ? ` · ${event.reason}` : ""}</span>
        </div>)}
      </section>}
      <div className="detail-grid">
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginTop: 0 }}>Route</h2>
          {booking.ticketId && (
            <Row
              label="Tracking ticket"
              value={<span style={{ fontFamily: "monospace" }}>{booking.ticketId}</span>}
            />
          )}
          <Row label="Pickup" value={booking.pickupLabel} />
          <Row label="Drop-off" value={booking.dropoffLabel} />
          <Row label="Distance" value={`${booking.distanceKm} km`} />
          <Row label="Vehicle" value={VEHICLE_LABEL[booking.vehicleClass] ?? booking.vehicleClass} />
          {isRide ? (
            <Row label="Passengers" value={String(booking.passengers ?? 1)} />
          ) : (
            <Row label="Cargo weight" value={`${booking.cargoWeightKg} kg`} />
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginTop: 0 }}>Fare</h2>
          <Row label="Base fare" value={`₱${booking.baseFare.toFixed(2)}`} />
          <Row label="Surge" value={`×${booking.surgeMultiplier.toFixed(1)}`} />
          <Row label="Total" value={`₱${booking.totalFare.toFixed(2)} ${booking.currency}`} />
          <Row label="Payment method" value="Cash" />
          <Row label="Payment status" value={PAYMENT_STATUS_LABEL[booking.paymentStatus]} />
          <Row label="Customer confirmation" value={booking.customerPaidAt ? `₱${booking.customerPaidAmount?.toFixed(2)} · ${booking.customerPaidAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}` : "Not yet confirmed"} />
          <Row label="Rider confirmation" value={booking.riderReceivedAt ? `₱${booking.riderReceivedAmount?.toFixed(2)} · ${booking.riderReceivedAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}` : "Not yet confirmed"} />
          <Row label="Paid at" value={booking.paidAt?.toLocaleString("en-PH", { timeZone: "Asia/Manila" }) ?? "—"} />
          <Row label="Payment reference" value={booking.paymentReference ?? "—"} />
          {booking.cancellationReason && <Row label="Cancellation reason" value={booking.cancellationReason} />}
          <Row label="Created" value={new Date(booking.createdAt).toLocaleString()} />
          {booking.deliveredAt && <Row label="Completed" value={new Date(booking.deliveredAt).toLocaleString()} />}
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
              <Row label="Vehicle plate" value={booking.rider.riderProfile?.vehiclePlate ?? "—"} />
              <Row label="Rating" value={(booking.rider.riderProfile?.rating ?? 5).toFixed(1)} />
            </>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No rider assigned yet.</p>
          )}
        </div>
      </div>

      {booking.assignmentExpiresAt && <p className="muted small">Rider offer expires: {booking.assignmentExpiresAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p>}
      <BookingControls key={booking.updatedAt.toISOString()} id={booking.id} status={booking.status} paymentStatus={booking.paymentStatus} reference={booking.paymentReference} canAssign={canAssign} riders={riders} />
      <section className="card" style={{ padding: 20, marginTop: 20 }}><h2>Payment history</h2>{booking.paymentEvents.map(event => <div className="detail-row" key={event.id}><span>{event.createdAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</span><span>{event.actorName} · {event.action.replaceAll("_", " ")} · {PAYMENT_STATUS_LABEL[event.toStatus]}{event.amount ? ` · ₱${event.amount.toFixed(2)}` : ""}{event.reason ? ` · ${event.reason}` : ""}{event.reference ? ` · ${event.reference}` : ""}</span></div>)}{!booking.paymentEvents.length && <p className="muted small">No payment confirmations yet.</p>}</section>
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
