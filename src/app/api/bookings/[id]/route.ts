import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";

// Admin override: force-cancel a booking regardless of who it belongs to.
// Deliberately narrow in scope — this only ever sets status to CANCELLED
// using the existing schema field, so it can't drift the database out of
// sync with what the main Fetch-It app expects.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { action } = await req.json();

  if (action !== "cancel") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  const changed = await db.booking.updateMany({
    where: { id, status: { notIn: ["DELIVERED", "CANCELLED"] } },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (changed.count === 0) return NextResponse.json({ error: "Booking is completed, cancelled, or no longer available." }, { status: 409 });
  const booking = await db.booking.findUnique({ where: { id } });

  return NextResponse.json({ booking });
}
