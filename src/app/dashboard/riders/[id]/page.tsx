import { requireAdminPage } from "@/lib/admin-access";
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { ACTIVE_STATUSES } from '@/lib/operations';
import { VEHICLE_LABEL } from '@/lib/constants';
import { StatusBadge } from '../../status-badge';
import { BanButton } from '../../ban-button';
export default async function RiderProfile({params}:{params:Promise<{id:string}>}) {
  await requireAdminPage();
  const {id}=await params;
  const rider=await db.user.findUnique({where:{id}});if(!rider||rider.role!=='RIDER') notFound();
  const [active,recent,reviews,completed,cancelled,total]=await Promise.all([
    db.booking.findMany({where:{riderId:id,status:{in:ACTIVE_STATUSES}},orderBy:{createdAt:'desc'},take:50}),
    db.booking.findMany({where:{riderId:id,status:{in:['DELIVERED','CANCELLED']}},orderBy:[{updatedAt:'desc'},{id:'desc'}],take:25}),
    db.customerReview.findMany({where:{riderId:id},include:{customer:{select:{name:true}},booking:{select:{refCode:true}}},orderBy:{createdAt:'desc'},take:20}),
    db.booking.count({where:{riderId:id,status:'DELIVERED'}}),db.booking.count({where:{riderId:id,status:'CANCELLED'}}),db.booking.count({where:{riderId:id}})
  ]);
  const stamp=(d:Date)=>d.toLocaleString('en-PH',{timeZone:'Asia/Manila'});
  const jobs=(items:typeof active)=><div className="ticket-list">{items.map(b=><Link className="card booking-mobile-card profile-job" href={`/dashboard/bookings/${b.id}`} key={b.id}><div className="booking-card-header"><strong>{b.refCode}</strong><StatusBadge status={b.status}/></div><p>{b.dropoffLabel}</p><span className="muted small">{b.type==='RIDE'?'Ride':'Delivery'} · ₱{b.totalFare.toFixed(2)} →</span></Link>)}</div>;
  return <div><Link className="muted small" href="/dashboard/riders">← Back to riders</Link><div className="page-heading" style={{marginTop:20}}><div><div className="eyebrow">RIDER PROFILE</div><h1>{rider.name}</h1><p className="muted small">{rider.email} · {rider.phone??'No phone supplied'}</p></div><BanButton userId={id} isBanned={rider.isBanned}/></div>
  <section className="card profile-header"><div><span className={`badge ${rider.isBanned?'badge-red':rider.isOnline?'badge-green':'badge-gray'}`}>{rider.isBanned?'Restricted':rider.isOnline?'Online':'Offline'}</span><p>{VEHICLE_LABEL[rider.vehicleClass??'']??'Vehicle not set'} · {rider.vehiclePlate??'No plate supplied'}</p>{rider.banReason&&<p className="error-message">{rider.banReason}</p>}</div><div><p className="muted small">Last location update</p><strong>{rider.locationAt?stamp(rider.locationAt):'No location recorded'}</strong><p className="muted small">Profile updated {stamp(rider.updatedAt)}</p></div></section>
  <div className="stat-grid" style={{margin:'20px 0'}}>{[['Completed',completed],['Cancelled',cancelled],['Assigned bookings',total],['Customer rating',rider.rating.toFixed(1)+' / 5']].map(([label,value])=><div className="card" style={{padding:20}} key={label}><p className="muted small">{label}</p><strong style={{fontSize:26}}>{value}</strong></div>)}</div>
  <div className="detail-grid"><section><h2>Current assignments</h2><p className="muted small">Up to 50 active bookings.</p>{active.length?jobs(active):<div className="card empty-state">No active assignments.</div>}</section><section><h2>Recent booking history</h2><p className="muted small">Latest 25 completed or cancelled bookings.</p>{recent.length?jobs(recent):<div className="card empty-state">No finished bookings yet.</div>}</section></div>
  <section style={{marginTop:24}}><h2>Customer reviews</h2><p className="muted small">Latest 20 reviews.</p><div className="ticket-list">{reviews.map(r=><article className="card conversation" key={r.id}><div className="booking-card-header"><strong>★ {r.rating}/5 · {r.customer.name}</strong><Link className="muted small" href={`/dashboard/bookings/${r.bookingId}`}>{r.booking.refCode} →</Link></div>{r.comment&&<p style={{whiteSpace:'pre-wrap'}}>{r.comment}</p>}<time className="muted small">{stamp(r.createdAt)}</time></article>)}</div>{!reviews.length&&<div className="card empty-state">No reviews yet.</div>}</section></div>;
}
