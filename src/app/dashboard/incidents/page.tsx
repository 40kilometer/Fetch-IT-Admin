import {requireStaffPage} from '@/lib/staff-access';
import {db} from '@/lib/db';
import {refreshOperationalSignals} from '@/lib/staff-notifications';
import Link from 'next/link';
import {hasPermission} from '@/lib/staff-policy';
export const dynamic='force-dynamic';
export default async function Page(){
 const staff=await requireStaffPage();await refreshOperationalSignals(db);
 const [records,advisories]=await Promise.all([
  db.platformIncident.findMany({where:{OR:[{active:true},{resolvedAt:{gt:new Date(Date.now()-7*86400000)}}]},orderBy:[{active:'desc'},{updatedAt:'desc'}],take:100}),
  db.staffResource.findMany({where:{kind:'ANNOUNCEMENT',...(!hasPermission(staff.role,'operations')?{OR:[{audienceRoles:{isEmpty:true}},{audienceRoles:{has:staff.role}}]}:{})},orderBy:[{updatedAt:'desc'},{id:'desc'}],take:20}),
 ]);
 return <div><h1>{staff.role==='SUPERADMIN'?'Platform incidents & operational advisories':'Operational advisories'}</h1><p>Shared service impact and recovery updates. Individual customer conversations and Safety evidence stay in their permitted queues.</p>{staff.role==='SUPERADMIN'&&<p><Link className="btn" href="/dashboard/incidents/new">Publish verified incident</Link></p>}{!records.length&&<p className="card empty-state">No active or recently recovered incidents have been reported.</p>}{records.map(record=><article className="card conversation" key={record.id}><h2>{record.title}</h2><span className={`badge ${record.active?'badge-amber':'badge-green'}`}>{record.active?record.severity:'Recovered'}</span><p>{record.scope}</p><p>{record.detail}</p><p className="muted small">Updated {record.updatedAt.toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p></article>)}{advisories.length>0&&<section className="section-block" aria-labelledby="shared-advisories-title"><h2 id="shared-advisories-title">Team advisories</h2>{advisories.map(record=><article className="card conversation" key={record.id}><h3>{record.title}</h3><p className="preserve-lines">{record.body}</p><p className="muted small">Updated {record.updatedAt.toLocaleString('en-PH',{timeZone:'Asia/Manila'})} · Philippine time</p></article>)}</section>}<p className="muted small">Monitoring uses recorded server failures and eligible booking backlogs. No report is a guarantee that external services are healthy.</p></div>;
}
