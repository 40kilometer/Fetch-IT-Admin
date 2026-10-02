import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/admin-access";
import { bookingWhere } from "@/lib/operations";

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  // Keep spreadsheet programs from evaluating user-entered addresses as formulas.
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(req: NextRequest) {
  if (!await currentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = req.nextUrl.searchParams;
  let where;
  try { where = bookingWhere(Object.fromEntries(params)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid dates." }, { status: 400 }); }
  const bookings = await db.booking.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: { customer: { select: { name: true } }, rider: { select: { name: true } } },
  });

  const rows = [
    ["Reference", "Type", "Status", "Customer", "Rider", "Pickup", "Drop-off", "Scheduled at", "Created at", "Completed at", "Fare (PHP)"],
    ...bookings.map((b) => [b.refCode, b.type, b.status, b.customer.name, b.rider?.name ?? "", b.pickupLabel, b.dropoffLabel, b.scheduledAt?.toISOString() ?? "", b.createdAt.toISOString(), b.deliveredAt?.toISOString() ?? "", b.totalFare.toFixed(2)]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="fetch-it-bookings.csv"',
      "Cache-Control": "no-store",
    },
  });
}
