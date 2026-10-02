import Link from "next/link";
import { db } from "@/lib/db";
import { ReplyForm } from "./reply-form";
import { getAdminSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  const admin = await db.user.findUnique({ where: { id: session.uid }, select: { role: true, isBanned: true } });
  if (!admin || admin.role !== "ADMIN" || admin.isBanned) redirect("/login");
  const { status } = await searchParams;
  const selected = ["OPEN", "IN_PROGRESS", "RESOLVED"].includes(status ?? "") ? status : undefined;
  const tickets = await db.supportTicket.findMany({ where: selected ? { status: selected } : {}, include: { customer: { select: { name: true, email: true } }, booking: { select: { id: true, refCode: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  const reviews = await db.customerReview.findMany({ include: { customer: { select: { name: true } }, rider: { select: { name: true } }, booking: { select: { id: true, refCode: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  return <div style={{ display: "grid", gap: 20 }}>
    <h1 style={{ fontSize: 22 }}>Customer support</h1>
    <form style={{ display: "flex", gap: 10 }}><select className="input" name="status" defaultValue={selected ?? ""}><option value="">All requests</option>{["OPEN", "IN_PROGRESS", "RESOLVED"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select><button className="btn" type="submit">Filter</button></form>
    <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Latest 100 requests. Replies are visible to the customer in their booking help screen.</p>
    {!tickets.length && <p>No requests match this filter.</p>}
    {tickets.map((ticket) => <section key={ticket.id} className="card" style={{ padding: 20, display: "grid", gap: 14 }}>
      <div><Link href={`/dashboard/bookings/${ticket.booking.id}`} style={{ fontWeight: 600 }}>{ticket.booking.refCode}</Link> · {ticket.category.replaceAll("_", " ")}<p style={{ fontSize: 13, color: "var(--text-muted)" }}>{ticket.customer.name} · {ticket.customer.email} · {ticket.createdAt.toLocaleString()}</p></div>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{ticket.message}</p>
      <ReplyForm id={ticket.id} status={ticket.status} reply={ticket.adminReply} />
    </section>)}
    <h2 style={{ fontSize: 18 }}>Recent rider reviews</h2>
    {!reviews.length && <p>No reviews yet.</p>}
    {reviews.map((review) => <section key={review.id} className="card" style={{ padding: 16 }}><Link href={`/dashboard/bookings/${review.booking.id}`}>{review.booking.refCode}</Link> · {review.rating}/5 · {review.rider.name}<p style={{ fontSize: 13, color: "var(--text-muted)" }}>{review.customer.name} · {review.createdAt.toLocaleString()}</p><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{review.comment}</p></section>)}
  </div>;
}
