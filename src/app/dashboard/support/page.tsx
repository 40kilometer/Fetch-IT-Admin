import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/admin-access";
import { pageNumber, PAGE_SIZE } from "@/lib/operations";
import type { Prisma } from "@prisma/client";
export default async function SupportPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const admin = await currentAdmin(); if(!admin) redirect('/login');
  const raw = await searchParams;
  const value = (key:string) => typeof raw[key] === 'string' ? raw[key] as string : '';
  const status=value('status'),priority=value('priority'),assigned=value('assigned'),q=value('q').trim().slice(0,100),unanswered=value('unanswered');
  const where:Prisma.SupportTicketWhereInput = {AND:[
    ...(["OPEN","IN_PROGRESS","RESOLVED"].includes(status) ? [{status}] : []),
    ...(["LOW","NORMAL","HIGH","URGENT"].includes(priority) ? [{priority}] : []),
    ...(assigned === 'mine' ? [{assignedAdminId:admin.id}] : assigned==='unassigned' ? [{assignedAdminId:null}] : []),
    ...(unanswered==='1' ? [{status:{in:['OPEN','IN_PROGRESS']},adminReply:null}] : []),
    ...(q ? [{OR:[{booking:{refCode:{contains:q,mode:'insensitive' as const}}},{customer:{name:{contains:q,mode:'insensitive' as const}}}]}] : []),
  ]};
  const total=await db.supportTicket.count({where}); const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));const page=Math.min(pageNumber(value('page')),pages);
  const tickets=await db.supportTicket.findMany({where,include:{customer:{select:{name:true}},booking:{select:{refCode:true}},assignedAdmin:{select:{name:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:PAGE_SIZE,skip:(page-1)*PAGE_SIZE});
  const href=(next:number)=>{const params=new URLSearchParams();for(const key of ['status','priority','assigned','q','unanswered']) if(value(key)) params.set(key,value(key));params.set('page',String(next));return '/dashboard/support?'+params;};
  return <div><div className="page-heading"><div><div className="eyebrow">CUSTOMER CARE</div><h1>Support inbox</h1><p className="muted small">Prioritize requests, assign an admin, and open a conversation.</p></div></div><form className="card filters">
    {unanswered==='1' && <input name="unanswered" type="hidden" value="1" />}
    <label>Search<input className="input" name="q" defaultValue={q} placeholder="Booking or customer" /></label>
    <label>Status<select className="input" name="status" defaultValue={status}><option value="">All statuses</option>{['OPEN','IN_PROGRESS','RESOLVED'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
    <label>Priority<select className="input" name="priority" defaultValue={priority}><option value="">All priorities</option>{['LOW','NORMAL','HIGH','URGENT'].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
    <label>Assignment<select className="input" name="assigned" defaultValue={assigned}><option value="">All admins</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option></select></label>
    <div className="filter-actions"><button className="btn btn-primary">Apply filters</button><Link className="btn" href="/dashboard/support">Clear</Link>{unanswered==='1' && <p className="muted small">Showing unanswered requests.</p>}</div></form>
    <div className="ticket-list">{tickets.map(t=><Link id={`ticket-${t.id}`} key={t.id} href={`/dashboard/support/${t.id}`} className="card ticket-row"><div><strong>{t.booking.refCode}</strong><p className="muted small">{t.customer.name} · {t.category.replaceAll('_',' ')}</p><p className="ticket-preview">{t.message}</p></div><div className="ticket-meta"><span className={`badge ${t.priority==='URGENT'||t.priority==='HIGH'?'badge-red':'badge-gray'}`}>{t.priority}</span><span className={`badge ${t.status==='RESOLVED'?'badge-green':'badge-amber'}`}>{t.status.replaceAll('_',' ')}</span><span className="muted small">{t.assignedAdmin?.name ?? 'Unassigned'}</span><span className="muted small">{t.createdAt.toLocaleDateString('en-PH',{timeZone:'Asia/Manila'})} →</span></div></Link>)}</div>
    {!tickets.length && <div className="card empty-state">No requests match these filters.</div>}
    <div className="pagination"><span className="muted">{total} requests · Page {page} of {pages}</span><nav aria-label="Support pages">{page>1 && <Link className="btn" href={href(page-1)}>Previous</Link>}{page<pages && <Link className="btn" href={href(page+1)}>Next</Link>}</nav></div>
  </div>;
}
