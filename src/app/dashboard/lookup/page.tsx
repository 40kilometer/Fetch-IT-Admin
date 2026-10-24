import {PageHeader,StateBadge} from '@/components/admin-ui';
import {humanize} from '@/lib/admin-ui';
import {db} from '@/lib/db';
import {requireStaffPage} from '@/lib/staff-access';
import {supportScope} from '@/lib/staff-policy';
export default async function Page({searchParams}:{searchParams:Promise<{ref?:string}>}){const staff=await requireStaffPage('support');const{ref}=await searchParams;
  const tickets=ref?await db.supportTicket.findMany({where:{AND:[supportScope(staff),{booking:{refCode:ref.slice(0,100)}}]},select:{bookingId:true},take:25}):[];
  const bookings=await db.booking.findMany({where:{id:{in:tickets.flatMap(t=>t.bookingId?[t.bookingId]:[])}},select:{refCode:true,type:true,status:true,pickupLabel:true,dropoffLabel:true,totalFare:true,paymentStatus:true,customer:{select:{name:true}},rider:{select:{name:true}}}});
  return <div><PageHeader eyebrow="Customer care" title="Booking lookup" description="Search the exact reference of a booking linked to a support request in your queue."/><form className="card filters"><label>Booking reference<input className="input" name="ref" defaultValue={ref} required/></label><button className="btn btn-primary">Look up</button></form>{bookings.map(b=><section className="card conversation" key={b.refCode}><h2>{b.refCode}</h2><p>{humanize(b.type)} · <StateBadge value={b.status}/></p><p>{b.customer.name} · Rider: {b.rider?.name??'Awaiting acceptance'}</p><p>{b.pickupLabel} → {b.dropoffLabel}</p><p>₱{b.totalFare.toFixed(2)} · {humanize(b.paymentStatus)}</p></section>)}{ref&&!bookings.length&&<p>No accessible booking matches this reference.</p>}</div>;
}
