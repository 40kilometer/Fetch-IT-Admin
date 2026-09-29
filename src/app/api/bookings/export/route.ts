import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { BOOKING_STATUS_LABEL } from "@/lib/constants";

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  // Keep spreadsheet programs from evaluating user-entered addresses as formulas.
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const status = params.get("status") ?? "";
  const type = params.get("type") ?? "";
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const bookings = await db.booking.findMany({
    where: {
      ...(status && Object.hasOwn(BOOKING_STATUS_LABEL, status) ? { status } : {}),
      ...(type === "DELIVERY" || type === "RIDE" ? { type } : {}),
      ...(q ? { OR: [
        { refCode: { contains: q, mode: "insensitive" as const } },
        { pickupLabel: { contains: q, mode: "insensitive" as const } },
        { dropoffLabel: { contains: q, mode: "insensitive" as const } },
      ] } : {}),
    },
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
