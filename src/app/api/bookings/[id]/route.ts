import { withRequestLog } from "@/lib/request-guard";
import { recordBookingEvent } from "@/lib/booking-events";
import { bookingView } from "@/lib/db-data";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/admin-access";
async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await currentAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => null);
    if (body?.action !== "cancel" || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 500) return NextResponse.json({ error: "Add a cancellation reason of up to 500 characters." }, { status: 400 });
    const { id } = await params;
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${id} FOR UPDATE`;
      const before = await tx.booking.findUnique({ where: { id } });
      if (!before) return null;
      const changed = await tx.booking.updateMany({ where: { id, status: { notIn: ["DELIVERED", "CANCELLED"] } }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      if (!changed.count) return null;
      await recordBookingEvent(tx, id, { uid: admin.id, name: admin.name, role: "ADMIN" }, { action: "CANCELLED", fromStatus: before.status, toStatus: "CANCELLED", riderId: before.riderId, reason: body.reason.trim() });
      await tx.adminAudit.create({ data: { actorId: admin.id, actorName: admin.name, action: "BOOKING_CANCELLED", entityType: "BOOKING", entityId: id, details: { reason: body.reason.trim() } } });
      return tx.booking.findUnique({ where: { id } });
    });
    return result ? NextResponse.json({ booking: bookingView(result) }) : NextResponse.json({ error: "Booking is completed, cancelled, or no longer available." }, { status: 409 });
  } catch { return NextResponse.json({ error: "Couldn’t cancel the booking. Please retry." }, { status: 503 }); }
}

export const PATCH = withRequestLog("admin:bookings/[id]:PATCH", handlePATCH);
