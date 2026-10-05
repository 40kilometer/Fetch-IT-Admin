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
  return <div><Link className="muted small" href="/dashboard/support">← Back to support inbox</Link><div className="page-heading" style={{marginTop:20}}><div><div className="eyebrow">SUPPORT CONVERSATION</div><h1>{ticket.booking?.refCode ?? 'Account help'}</h1><p className="muted small">{ticket.category.replaceAll('_',' ')} · {ticket.customer.name}</p><p className="muted small">{ticket.customer.email}</p></div>{ticket.booking && <Link className="btn" href={`/dashboard/bookings/${ticket.booking.id}`}>View booking</Link>}</div><div className="detail-grid"><section className="card conversation"><h2>Conversation</h2><article className="conversation-message"><strong>{ticket.customer.name} · Customer</strong><time className="muted small">{stamp(ticket.createdAt)}</time><p>{ticket.message}</p></article>{ticket.messages.map(m=><article key={m.id} className={`conversation-message ${m.authorRole === 'ADMIN' ? 'admin-message' : ''}`}><strong>{m.authorName} · {m.authorRole === 'CUSTOMER' ? 'Customer' : 'Admin'}</strong><time className="muted small">{stamp(m.createdAt)}</time><p>{m.body}</p></article>)}</section><section className="card conversation"><h2>Manage request</h2><p className="muted small">Replies appear in the customer’s conversation and notification inbox. Reply to the latest customer message before resolving.</p><ReplyForm key={ticket.updatedAt.toISOString()} id={ticket.id} status={ticket.status} priority={ticket.priority} assignedAdminId={ticket.assignedAdminId} updatedAt={ticket.updatedAt.toISOString()} admins={admins} /></section></div></div>;
}
