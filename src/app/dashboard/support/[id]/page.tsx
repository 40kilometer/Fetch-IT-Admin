import { requireAdminPage } from "@/lib/admin-access";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ReplyForm } from "../reply-form";
export default async function SupportDetail({params}:{params:Promise<{id:string}>}) {
  await requireAdminPage();
  const {id}=await params;
  const ticket=await db.supportTicket.findUnique({where:{id},include:{customer:{select:{name:true,email:true}},booking:{select:{id:true,refCode:true}},messages:{orderBy:[{createdAt:'asc'},{id:'asc'}]}}});
  if(!ticket) notFound();
  const admins=await db.user.findMany({where:{role:'ADMIN',isBanned:false},select:{id:true,name:true},orderBy:{name:'asc'}});
  const stamp=(date:Date)=>date.toLocaleString('en-PH',{timeZone:'Asia/Manila'});
  return <div><Link className="muted small" href="/dashboard/support">← Back to support inbox</Link><div className="page-heading" style={{marginTop:20}}><div><div className="eyebrow">SUPPORT CONVERSATION</div><h1>{ticket.booking.refCode}</h1><p className="muted small">{ticket.category.replaceAll('_',' ')} · {ticket.customer.name}</p></div><Link className="btn" href={`/dashboard/bookings/${ticket.booking.id}`}>View booking</Link></div><div className="detail-grid"><section className="card conversation"><h2>Conversation</h2><article className="conversation-message"><strong>{ticket.customer.name} · Customer</strong><time className="muted small">{stamp(ticket.createdAt)}</time><p>{ticket.message}</p></article>{ticket.messages.map(m=><article key={m.id} className="conversation-message admin-message"><strong>{m.authorName} · Admin</strong><time className="muted small">{m.authorId === "legacy" ? "Reply recorded before conversation history was enabled." : stamp(m.createdAt)}</time><p>{m.body}</p></article>)}</section><section className="card conversation"><h2>Manage request</h2><p className="muted small">New replies are added to this conversation. The latest reply appears in the customer’s Booking help.</p><ReplyForm key={ticket.updatedAt.toISOString()} id={ticket.id} status={ticket.status} priority={ticket.priority} assignedAdminId={ticket.assignedAdminId} updatedAt={ticket.updatedAt.toISOString()} admins={admins} /></section></div></div>;
}
