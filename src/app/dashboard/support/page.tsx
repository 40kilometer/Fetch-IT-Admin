import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { awaitingSupportReply } from "@/lib/support-queue";
import { currentStaff } from "@/lib/staff-access";
import { PageHeader, StateBadge } from "@/components/admin-ui";
import { humanize } from "@/lib/admin-ui";
import { supportScope, hasPermission } from "@/lib/staff-policy";
import { pageNumber, PAGE_SIZE } from "@/lib/operations";
import type { Prisma, SupportStatus, SupportPriority } from "@prisma/client";
export default async function SupportPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const admin = await currentStaff('support'); if(!admin) redirect('/dashboard/workspace');
  const raw = await searchParams;
  const value = (key:string) => typeof raw[key] === 'string' ? raw[key] as string : '';
  const status=['all','OPEN','IN_PROGRESS','RESOLVED'].includes(value('status'))?value('status'):'active',priority=value('priority'),assigned=value('assigned'),q=value('q').trim().slice(0,100),unanswered=value('unanswered');
  const sort=['newest','oldest'].includes(value('sort'))?value('sort'):'priority';
  const assignees=hasPermission(admin.role,'support.manage')?await db.user.findMany({where:{role:{in:['ADMIN','SUPPORT','SUPPORT_SUPERVISOR']},isBanned:false},select:{id:true,name:true},orderBy:{name:'asc'}}):[];
  const where:Prisma.SupportTicketWhereInput = {AND:[
    supportScope(admin),
    ...(status==='active' ? [{status:{in:['OPEN','IN_PROGRESS'] as SupportStatus[]}}] : []),
    ...(["OPEN","IN_PROGRESS","RESOLVED"].includes(status) ? [{status: status as SupportStatus}] : []),
    ...(["LOW","NORMAL","HIGH","URGENT"].includes(priority) ? [{priority: priority as SupportPriority}] : []),
    ...(assigned === 'mine' ? [{assignedAdminId:admin.id}] : assigned==='unassigned' ? [{assignedAdminId:null}] : assigned && hasPermission(admin.role,'support.manage') ? [{assignedAdminId:assigned}] : []),
    ...(unanswered==='1' ? [awaitingSupportReply()] : []),
    ...(q ? [{OR:[{booking:{refCode:{contains:q,mode:'insensitive' as const}}},{customer:{name:{contains:q,mode:'insensitive' as const}}}]}] : []),
  ]};
  const total=await db.supportTicket.count({where}); const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));const page=Math.min(pageNumber(value('page')),pages);
  const tickets=await db.supportTicket.findMany({where,include:{customer:{select:{name:true}},booking:{select:{refCode:true}},assignedAdmin:{select:{name:true}},messages:{orderBy:[{createdAt:'desc'},{id:'desc'}],take:1}},orderBy:sort==='priority'?[{priority:'desc'},{lastCustomerMessageAt:'asc'},{id:'asc'}]:[{lastCustomerMessageAt:sort==='oldest'?'asc':'desc'},{id:'asc'}],take:PAGE_SIZE,skip:(page-1)*PAGE_SIZE});
  const href=(next:number)=>{const params=new URLSearchParams();for(const key of ['status','priority','assigned','q','unanswered','sort']) if(value(key)) params.set(key,value(key));params.set('page',String(next));return '/dashboard/support?'+params;};
  return <div><PageHeader eyebrow="Customer care" title="Support inbox" description="Prioritize requests, claim ownership, and open a conversation." /><form key={[q,status,priority,assigned,sort,unanswered].join(":")} className="card filters">
    {unanswered==='1' && <input name="unanswered" type="hidden" value="1" />}
    <label>Search<input className="input" name="q" defaultValue={q} placeholder="Booking or customer" /></label>
    <label>Status<select className="input" name="status" defaultValue={status}><option value="active">Open and in progress</option><option value="all">All statuses</option>{['OPEN','IN_PROGRESS','RESOLVED'].map(v=><option key={v} value={v}>{humanize(v)}</option>)}</select></label>
    <label>Priority<select className="input" name="priority" defaultValue={priority}><option value="">All priorities</option>{['LOW','NORMAL','HIGH','URGENT'].map(v=><option key={v} value={v}>{humanize(v)}</option>)}</select></label>
    <label>Assignment<select className="input" name="assigned" defaultValue={assigned}><option value="">All staff</option><option value="mine">Assigned to me</option><option value="unassigned">Unassigned</option>{assignees.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    <label>Sort by<select className="input" name="sort" defaultValue={sort}><option value="priority">Highest priority, oldest first</option><option value="oldest">Oldest waiting first</option><option value="newest">Newest first</option></select></label>
    <div className="filter-actions"><button className="btn btn-primary">Apply filters</button><Link className="btn" href="/dashboard/support">Clear</Link>{unanswered==='1' && <p className="muted small">Showing unanswered requests.</p>}</div></form>
    <div className="ticket-list">{tickets.map(t=><Link id={`ticket-${t.id}`} key={t.id} href={`/dashboard/support/${t.id}`} className="card ticket-row"><div><strong>{t.booking?.refCode ?? 'Account help'}</strong><p className="muted small">{t.customer.name} · {humanize(t.category)}</p><p className="ticket-preview">{t.messages[0]?.body ?? t.message}</p>{(!t.lastAdminReplyAt || t.lastCustomerMessageAt > t.lastAdminReplyAt) && t.status !== 'RESOLVED' && <span className="badge badge-amber">Awaiting reply</span>}</div><div className="ticket-meta"><StateBadge value={t.priority}/><StateBadge value={t.status}/><span className="muted small">{t.assignedAdmin?.name ?? 'Unassigned'}</span><span className="muted small">Last customer message {t.lastCustomerMessageAt.toLocaleString('en-PH',{timeZone:'Asia/Manila'})} (PH) →</span></div></Link>)}</div>
    {!tickets.length && <div className="card empty-state">No requests match these filters.</div>}
    <div className="pagination"><span className="muted">{total} requests · Page {page} of {pages}</span><nav aria-label="Support pages">{page>1 && <Link className="btn" href={href(page-1)}>Previous</Link>}{page<pages && <Link className="btn" href={href(page+1)}>Next</Link>}</nav></div>
  </div>;
}
