import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/admin-access";
import { db } from "@/lib/db";
import { currentStaff } from "@/lib/staff-access";
import { caseScope,hasPermission,supportScope } from "@/lib/staff-policy";
export async function GET() {
  try {
    const staff=await currentStaff();
    if (!staff) return NextResponse.json({ error: "Sign in with an active staff account." }, { status: 401 });
    if(!hasPermission(staff.role,'operations')) {
      const cases=await db.workflowCase.findMany({where:{AND:[caseScope(staff),{status:{notIn:['RESOLVED','REJECTED']}}]},take:30,orderBy:{updatedAt:'desc'},select:{id:true,title:true,status:true,updatedAt:true}});
      const tickets=hasPermission(staff.role,'support')?await db.supportTicket.findMany({where:{AND:[supportScope(staff),{status:{not:'RESOLVED'}}]},take:30,orderBy:{updatedAt:'desc'},select:{id:true,category:true,updatedAt:true}}):[];
      return NextResponse.json({items:[...cases.map(c=>({id:c.id,title:c.title,detail:c.status,at:c.updatedAt.toISOString(),href:`/dashboard/cases/${c.id}`})),...tickets.map(t=>({id:t.id,title:'Support request',detail:t.category,at:t.updatedAt.toISOString(),href:`/dashboard/support/${t.id}`}))].sort((a,b)=>b.at.localeCompare(a.at)),checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}});
    }
    const since = new Date(Date.now() - 7 * 86400000);
    const [created, cancelled, tickets, replies] = await Promise.all([
      db.booking.findMany({ where: { createdAt: { gte: since } }, select: { id: true, refCode: true, type: true, dropoffLabel: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 }),
      db.booking.findMany({ where: { status: "CANCELLED", cancelledAt: { gte: since } }, select: { id: true, refCode: true, dropoffLabel: true, cancelledAt: true }, orderBy: { cancelledAt: "desc" }, take: 100 }),
      db.supportTicket.findMany({ where: { createdAt: { gte: since } }, select: { id: true, category: true, createdAt: true, booking: { select: { refCode: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
      db.supportMessage.findMany({ where: { authorRole: "CUSTOMER", createdAt: { gte: since } }, select: { id: true, ticketId: true, body: true, createdAt: true, ticket: { select: { booking: { select: { refCode: true } }, customer: { select: { name: true } } } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 }),
    ]);
    const items = [
      ...created.map(b => ({ id: `new:${b.id}`, title: `New ${b.type === "RIDE" ? "ride" : "delivery"}`, detail: `${b.refCode} · ${b.dropoffLabel}`, at: b.createdAt.toISOString(), href: `/dashboard/bookings/${b.id}` })),
      ...cancelled.map(b => ({ id: `cancel:${b.id}`, title: "Booking cancelled", detail: `${b.refCode} · ${b.dropoffLabel}`, at: b.cancelledAt!.toISOString(), href: `/dashboard/bookings/${b.id}` })),
      ...tickets.map(t => ({ id: `support:${t.id}`, title: "New support request", detail: `${t.booking?.refCode ?? "Account help"} · ${t.category.replaceAll("_", " ")}`, at: t.createdAt.toISOString(), href: `/dashboard/support/${t.id}` })),
      ...replies.map(m => ({ id: `support-reply:${m.id}`, title: "Customer replied", detail: `${m.ticket.booking?.refCode ?? "Account help"} · ${m.ticket.customer.name}: ${m.body.slice(0, 120)}`, at: m.createdAt.toISOString(), href: `/dashboard/support/${m.ticketId}` })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
    return NextResponse.json({ items, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Notifications are unavailable. Please retry." }, { status: 503 }); }
}
