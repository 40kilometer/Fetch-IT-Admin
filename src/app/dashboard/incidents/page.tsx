import {requireStaffPage} from '@/lib/staff-access';
import {db} from '@/lib/db';
import {refreshOperationalSignals} from '@/lib/staff-notifications';
import Link from 'next/link';
export const dynamic='force-dynamic';
export default async function Page(){
 const staff=await requireStaffPage();await refreshOperationalSignals(db);
 const records=await db.platformIncident.findMany({where:{OR:[{active:true},{resolvedAt:{gt:new Date(Date.now()-7*86400000)}}]},orderBy:[{active:'desc'},{updatedAt:'desc'}],take:100});
 return <div><h1>{staff.role==='SUPERADMIN'?'Platform incidents & operational advisories':'Operational advisories'}</h1><p>Shared service impact and recovery updates. Individual customer conversations and Safety evidence stay in their permitted queues.</p>{staff.role==='SUPERADMIN'&&<p><Link className="btn" href="/dashboard/incidents/new">Publish verified incident</Link></p>}{!records.length&&<p className="card empty-state">No active or recently recovered incidents have been reported.</p>}{records.map(record=><article className="card conversation" key={record.id}><h2>{record.title}</h2><span className={`badge ${record.active?'badge-amber':'badge-green'}`}>{record.active?record.severity:'Recovered'}</span><p>{record.scope}</p><p>{record.detail}</p><p className="muted small">Updated {record.updatedAt.toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p></article>)}<p className="muted small">Monitoring uses recorded server failures and eligible booking backlogs. No report is a guarantee that external services are healthy.</p></div>;
}
