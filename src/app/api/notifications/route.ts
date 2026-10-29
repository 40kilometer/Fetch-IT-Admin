import {reviewLabel,reviewStatus} from "@/lib/review-queue";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentStaff } from "@/lib/staff-access";
import { caseScope, hasPermission, supportScope } from "@/lib/staff-policy";

export async function GET() {
  try {
    const staff = await currentStaff();
    if (!staff) return NextResponse.json({ error: "Sign in with an active staff account." }, { status: 401 });
    const operations = hasPermission(staff.role, "operations");
    const support = hasPermission(staff.role, "support");
    const finance = hasPermission(staff.role, "finance");
    const overdue = new Date(Date.now() - 5 * 60_000);
    const [cases, waiting, mismatches, tickets, applications] = await Promise.all([
      db.workflowCase.findMany({ where: { AND: [caseScope(staff), { status: { not: "RESOLVED" } }] },
        take: 50, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, kind: true, status: true, version: true, updatedAt: true } }),
      operations ? db.booking.findMany({ where: { status: "PENDING", riderId: null, createdAt: { lte: overdue },
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: overdue } }],
        AND: [{ OR: [{ paymentMethod: "CASH" }, { paymentStatus: "PAID" }] }] },
        select: { id: true, refCode: true, type: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 30 }) : [],
      finance ? db.$queryRaw<{ id: string; refCode: string; updatedAt: Date }[]>`
        SELECT "id", "refCode", "updatedAt" FROM "Booking"
        WHERE "paymentMethod" = 'CASH' AND "paymentStatus" = 'PENDING'
          AND "customerPaidAmount" IS NOT NULL AND "riderReceivedAmount" IS NOT NULL
          AND ("customerPaidAmount" <> "totalFare" OR "riderReceivedAmount" <> "totalFare")
        ORDER BY "updatedAt" DESC LIMIT 30` : [],
      support ? db.supportTicket.findMany({ where: { AND: [supportScope(staff), { status: { not: "RESOLVED" } }] },
        select: { id: true, category: true, createdAt: true, lastCustomerMessageAt: true, lastAdminReplyAt: true, booking: { select: { refCode: true } } }, orderBy: { lastCustomerMessageAt: "desc" }, take: 100 }) : [],
      operations ? db.riderApplication.findMany({ where: { status: { in: ["SUBMITTED", "IN_REVIEW", "FORCE_APPROVAL_PENDING"] } },
        select: { id: true, version: true, status: true, updatedAt: true, user: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 30 }) : [],
    ]);
    const items = [
      ...cases.map(c => ({ id: `case:${c.id}:${c.version}`, title: c.title, detail: `${reviewLabel(c.kind)} · ${reviewLabel(reviewStatus(c.status))}`, at: c.updatedAt.toISOString(), href: `/dashboard/cases/${c.id}` })),
      ...waiting.map(b => ({ id: `unassigned:${b.id}`, title: `${b.type === "RIDE" ? "Ride" : "Delivery"} needs a rider`, detail: `${b.refCode} · Waiting more than 5 minutes after pickup became due`, at: b.createdAt.toISOString(), href: `/dashboard/bookings/${b.id}` })),
      ...mismatches.map(b => ({ id: `payment:${b.id}:${b.updatedAt.toISOString()}`, title: "Cash payment needs review", detail: `${b.refCode} · Confirmed amounts do not match the fare`, at: b.updatedAt.toISOString(), href: operations ? `/dashboard/bookings/${b.id}` : `/dashboard/finance?ref=${encodeURIComponent(b.refCode)}` })),
      ...tickets.filter(t => !t.lastAdminReplyAt || t.lastCustomerMessageAt > t.lastAdminReplyAt).map(t => ({ id: `support:${t.id}:${t.lastCustomerMessageAt.toISOString()}`, title: t.lastAdminReplyAt ? "Customer replied" : "Support request needs a reply", detail: `${t.booking?.refCode ?? "Account help"} · ${t.category.replaceAll("_", " ")}`, at: t.lastCustomerMessageAt.toISOString(), href: `/dashboard/support/${t.id}` })),
      ...applications.map(a => ({ id: `application:${a.id}:${a.version}`, title: a.status === "FORCE_APPROVAL_PENDING" ? "Force approval needs your decision" : "Rider application needs review", detail: a.user.name, at: a.updatedAt.toISOString(), href: `/dashboard/applications/${a.id}` })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
    return NextResponse.json({ items, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Notifications are unavailable. Please retry." }, { status: 503 }); }
}
