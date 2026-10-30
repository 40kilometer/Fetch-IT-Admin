import Link from "next/link";
import { db } from "@/lib/db";
import { humanize } from "@/lib/admin-ui";
import type { AdminAudit } from "@prisma/client";
export async function AuditEvents({events}:{events:AdminAudit[]}) {
  const ids=(type:string)=>[...new Set(events.filter(e=>e.entityType===type).map(e=>e.entityId))];
  const [apps,cases,bookings,tickets]=await Promise.all([
    ids('RIDER_APPLICATION').length?db.riderApplication.findMany({where:{id:{in:ids('RIDER_APPLICATION')}},select:{id:true,user:{select:{name:true}}}}):[],
    ids('CASE').length?db.workflowCase.findMany({where:{id:{in:ids('CASE')}},select:{id:true,title:true}}):[],
    ids('BOOKING').length?db.booking.findMany({where:{id:{in:ids('BOOKING')}},select:{id:true,refCode:true}}):[],
    ids('SUPPORT').length?db.supportTicket.findMany({where:{id:{in:ids('SUPPORT')}},select:{id:true,customer:{select:{name:true}}}}):[],
  ]);
  const names=new Map([...apps.map(a=>[a.id,a.user.name.replace(/^Demo · /,"")] as const),...cases.map(c=>[c.id,c.title] as const),...bookings.map(b=>[b.id,b.refCode] as const),...tickets.map(t=>[t.id,t.customer.name] as const)]);
  const groups:{events:AdminAudit[]}[]=[];
  for(const event of events){const last=groups.at(-1),prior=last?.events.at(-1);if(prior&&prior.entityId===event.entityId&&prior.entityType===event.entityType&&prior.action===event.action&&prior.actorId===event.actorId&&prior.createdAt.getTime()-event.createdAt.getTime()<300000)last!.events.push(event);else groups.push({events:[event]});}
  return <div className="ticket-list">{groups.map(({events:group})=>{const first=group[0],target=({RIDER_APPLICATION:'applications',CASE:'cases',BOOKING:'bookings',SUPPORT:'support'} as Record<string,string>)[first.entityType];return <article className="card audit-row" key={first.id}><div><strong>{first.actorName} · {humanize(first.action)}</strong><p>{target?<Link href={`/dashboard/${target}/${encodeURIComponent(first.entityId)}`}>{names.get(first.entityId)??humanize(first.entityType)} →</Link>:names.get(first.entityId)??humanize(first.entityType)}</p></div><time dateTime={first.createdAt.toISOString()}>{first.createdAt.toLocaleString('en-PH',{timeZone:'Asia/Manila'})} PHT</time><details><summary>{group.length>1?`${group.length} recorded actions · View changes`:'View changes & record ID'}</summary>{group.map(event=><div className="audit-event" key={event.id}><p className="muted small">{event.createdAt.toLocaleTimeString('en-PH',{timeZone:'Asia/Manila'})} · Record ID: {event.entityId}</p><dl className="audit-details">{Object.entries(event.details&&typeof event.details==='object'&&!Array.isArray(event.details)?event.details:{}).map(([key,value])=><div key={key}><dt>{humanize(key)}</dt><dd>{value===null?'None':typeof value==='object'?JSON.stringify(value):String(value)}</dd></div>)}</dl></div>)}</details></article>})}</div>;
}
