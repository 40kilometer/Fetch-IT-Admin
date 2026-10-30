import { AuditEvents } from "@/components/audit-events";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { humanize } from '@/lib/admin-ui';
import { requireAdminPage } from "@/lib/admin-access";
import Link from 'next/link';
import { db } from '@/lib/db';
import { pageNumber, PAGE_SIZE, dateBounds } from '@/lib/operations';
const labels:Record<string,string>={LOGIN_SUCCEEDED:'Login succeeded',LOGIN_FAILED:'Login failed',PASSWORD_RESET:'Password reset',PAYMENT_UPDATED:'Payment updated',RIDER_ASSIGNED:'Rider assigned',BOOKING_CANCELLED:'Booking cancelled',USER_RESTRICTED:'Account restricted',USER_RESTORED:'Restriction lifted',SUPPORT_UPDATED:'Support request updated'};
export default async function AuditPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  await requireAdminPage();
  const raw=await searchParams;const value=(k:string)=>typeof raw[k]==='string'?raw[k] as string:'';
  const action=value('action'),q=value('q').trim().slice(0,100);let error='';let dates={};try{dates=dateBounds(value('from'),value('to'));}catch(e){error=e instanceof Error?e.message:'Choose valid dates.';}
  const where={...((action&&labels[action])?{action}:{}),createdAt:dates,...(q?{OR:[{actorName:{contains:q,mode:'insensitive' as const}},{entityId:{contains:q,mode:'insensitive' as const}}]}:{})};
  const total=error?0:await db.adminAudit.count({where});const pages=Math.max(1,Math.ceil(total/PAGE_SIZE)),page=Math.min(pageNumber(value('page')),pages);
  const events=error?[]:await db.adminAudit.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:PAGE_SIZE,skip:(page-1)*PAGE_SIZE});
  const href=(n:number)=>{const p=new URLSearchParams();for(const k of ['q','action','from','to'])if(value(k))p.set(k,value(k));p.set('page',String(n));return '/dashboard/audit?'+p;};
  return <div><div className="page-heading"><div><div className="eyebrow">ACCOUNTABILITY</div><h1>Audit log</h1><p className="muted small">Admin logins, payment changes and actions with dates and times.</p></div></div><AutoFilterForm><label>Search<input className="input" name="q" defaultValue={q} placeholder="Admin name or record ID"/></label><label>Action<select className="input" name="action" defaultValue={action}><option value="">All actions</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>From date<input className="input" type="date" name="from" defaultValue={value('from')}/></label><label>To date<input className="input" type="date" name="to" defaultValue={value('to')}/></label><div className="filter-actions"><Link className="btn" href="/dashboard/audit">Clear</Link></div></AutoFilterForm>{error&&<p className="error-message" role="alert">{error}</p>}{await AuditEvents({events})}{!events.length&&!error&&<div className="card empty-state">No admin actions match these filters.</div>}<div className="pagination"><span className="muted">{total} actions · Page {page} of {pages}</span><nav aria-label="Audit pages">{page>1&&<Link className="btn" href={href(page-1)}>Previous</Link>}{page<pages&&<Link className="btn" href={href(page+1)}>Next</Link>}</nav></div></div>;
}
