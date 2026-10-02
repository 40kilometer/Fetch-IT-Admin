// Opt-in check against localhost and the configured DB. All records are disposable.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
if(process.env.RUN_ADMIN_INTEGRATION!=='1') throw new Error('Set RUN_ADMIN_INTEGRATION=1.');
process.loadEnvFile('.env');
const db = new PrismaClient();
const fixtureFile = '.admin-ui-fixture.json';
const fixture = {marker:'ops-check-'+crypto.randomUUID(),users:[],bookings:[]};
const password='Disposable-UI-Check-2026!';
function cookie(user) {
  const payload=Buffer.from(JSON.stringify({uid:user.id,email:user.email,name:user.name,exp:Date.now()+600000})).toString('base64url');
  return 'fetchit_admin_session='+payload+'.'+crypto.createHmac('sha256',process.env.ADMIN_SESSION_SECRET||'fetch-it-admin-dev-secret-please-rotate').update(payload).digest('base64url');
}
async function request(path,token,expected=200,method="GET",data) {
  const res=await fetch('http://localhost:3002'+path,{method,headers:{...(token?{cookie:token}:{}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),redirect:'manual'});
  const body=await res.text(); assert.equal(res.status,expected,body.slice(0,150));
  return res.headers.get('content-type')?.includes('application/json')?JSON.parse(body):body;
}
async function cleanup(data) {
  const users=await db.user.findMany({where:{id:{in:data.users}}});
  assert(users.every(u=>u.email.startsWith(data.marker)), 'Only fixture accounts may be removed');
  await db.adminAudit.deleteMany({where:{actorId:{in:data.users}}});
  await db.customerReview.deleteMany({where:{bookingId:{in:data.bookings}}});
  await db.supportTicket.deleteMany({where:{bookingId:{in:data.bookings}}});
  await db.booking.deleteMany({where:{id:{in:data.bookings},customerId:{in:data.users}}});
  await db.user.deleteMany({where:{id:{in:data.users}}});
}
async function user(role) {
  const salt=crypto.randomBytes(16).toString('hex');
  const saved=await db.user.create({data:{name:'Operations preview',email:`${fixture.marker}-${role.toLowerCase()}@example.invalid`,role,passwordHash:salt+':'+crypto.scryptSync(password,salt,64).toString('hex')}});
  fixture.users.push(saved.id); return saved;
}
(async()=>{
  if(process.env.CLEAN_ADMIN_UI_FIXTURES==='1') {const stored=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));await cleanup(stored);fs.unlinkSync(fixtureFile);await db.$disconnect();console.log('Disposable UI fixtures removed.');return;}
  let keep=false;
  try {
    await request('/api/notifications',null,401);
    const admin=await user('ADMIN'), customer=await user('CUSTOMER'), rider=await user('RIDER');
    const token=cookie(admin);
    await request('/api/notifications',cookie(customer),401);
    await db.user.update({where:{id:admin.id},data:{isBanned:true}});
    await request('/api/notifications',token,401);
    await db.user.update({where:{id:admin.id},data:{isBanned:false}});
    const now=new Date(); const date=new Date(now.getTime()+8*3600000).toISOString().slice(0,10);
    const start=new Date(date+'T00:00:00+08:00');
    const base={customerId:customer.id,riderId:rider.id,type:'DELIVERY',status:'DELIVERED',pickupLabel:'26FJ+V7V, Ramos St, Lingayen, 2426 Pangasinan, Philippines',pickupLat:16.03,pickupLng:120.23,dropoffLabel:'256b Sacred Heart, Maniboc, Lingayen, Pangasinan, Philippines',dropoffLat:16.04,dropoffLng:120.24,vehicleClass:'TRICYCLE',distanceKm:2.04,baseFare:50,surgeMultiplier:1,totalFare:62,createdAt:now,matchedAt:new Date(now-60000),pickedUpAt:new Date(now-30000),deliveredAt:now};
    const rows=Array.from({length:27},(_,i)=>({...base,id:crypto.randomUUID(),refCode:`${fixture.marker}-page-${i}`}));
    rows[0].createdAt=start; rows[1].createdAt=new Date(start.getTime()+86400000-1); rows[2].createdAt=new Date(start-1);
    rows[3].status='CANCELLED';rows[3].cancelledAt=now;rows[3].deliveredAt=null;
    const waited={...base,id:crypto.randomUUID(),refCode:fixture.marker+'-waiting',status:'MATCHED',riderId:null,createdAt:new Date(now-600000),updatedAt:new Date(now-600000),deliveredAt:null,pickedUpAt:null};
    const future={...waited,id:crypto.randomUUID(),refCode:fixture.marker+'-future',scheduledAt:new Date(now.getTime()+86400000)};
    const stalled={...waited,id:crypto.randomUUID(),refCode:fixture.marker+'-stalled',riderId:rider.id,updatedAt:new Date(now-3600000)};
    await db.booking.createMany({data:[...rows,waited,future,stalled]});fixture.bookings.push(...rows.map(b=>b.id),waited.id,future.id,stalled.id);
    let ticket=await db.supportTicket.create({data:{customerId:customer.id,bookingId:rows[0].id,category:'BOOKING',message:'Disposable operations preview request'}});
    const first=await request('/dashboard/bookings?q='+fixture.marker+'-page',token);
    assert(first.includes('of 27 bookings'));assert(first.includes('Page <!-- -->1<!-- --> of <!-- -->2'));
    const second=await request('/dashboard/bookings?q='+fixture.marker+'-page&page=2',token);
    assert(second.includes('of 27 bookings'));assert(second.includes('Page <!-- -->2<!-- --> of <!-- -->2'));
    const dated=await request(`/api/bookings/export?q=${fixture.marker}-page&from=${date}&to=${date}`,token);
    assert(dated.includes(rows[0].refCode));assert(dated.includes(rows[1].refCode));assert(!dated.includes('"'+rows[2].refCode+'"'));
    await request('/api/bookings/export?from=2026-02-30',token,400);
    await request('/api/bookings/export?from=2026-10-04&to=2026-10-03',token,400);
    const waiting=await request('/api/bookings/export?q='+fixture.marker+'&attention=unassigned',token);
    assert(waiting.includes(waited.refCode));assert(!waiting.includes(future.refCode));assert(!waiting.includes(stalled.refCode));
    const progress=await request('/api/bookings/export?q='+fixture.marker+'&attention=stalled',token);
    assert(progress.includes(stalled.refCode));assert(!progress.includes(waited.refCode));
    const feed=await request('/api/notifications',token);
    assert(feed.items.some(i=>i.id==='cancel:'+rows[3].id));assert(feed.items.some(i=>i.id==='support:'+ticket.id));
    assert(feed.items.every((i,index)=>index===0||feed.items[index-1].at>=i.at));
    const detail=await request('/dashboard/bookings/'+rows[0].id,token);assert(detail.includes('Booking timeline'));assert(detail.includes('Parcel picked up'));
    const support=await request('/dashboard/support?unanswered=1',token);assert(support.includes('ticket-'+ticket.id));
    await request(`/api/support/${ticket.id}`,token,400,'PATCH',{status:'OPEN',reply:'',priority:'URGENT',assignedAdminId:customer.id});
    ticket=await db.supportTicket.update({where:{id:ticket.id},data:{adminReply:'Previous fixture reply'}});
    const supportData={status:'IN_PROGRESS',reply:'First new fixture reply',priority:'URGENT',assignedAdminId:admin.id,updatedAt:ticket.updatedAt.toISOString()};
    const changed=await request(`/api/support/${ticket.id}`,token,200,'PATCH',supportData);
    await request(`/api/support/${ticket.id}`,token,409,'PATCH',supportData);
    const next=await request(`/api/support/${ticket.id}`,token,200,'PATCH',{...supportData,reply:'Second fixture reply',updatedAt:changed.ticket.updatedAt});
    await request(`/api/support/${ticket.id}`,token,200,'PATCH',{...supportData,status:'RESOLVED',reply:'',updatedAt:next.ticket.updatedAt});
    const history=await db.supportMessage.findMany({where:{ticketId:ticket.id},orderBy:{createdAt:'asc'}});
    assert.equal(history.length,3);assert.equal(history[0].body,'Previous fixture reply');
    assert.equal((await db.supportTicket.findUnique({where:{id:ticket.id}})).adminReply,'Second fixture reply');
    const conversation=await request('/dashboard/support/'+ticket.id,token);assert(conversation.includes('Previous fixture reply'));assert(conversation.includes('Second fixture reply'));assert(conversation.includes('URGENT'));
    await request(`/api/users/${rider.id}`,cookie(customer),401,'PATCH',{action:'ban',reason:'Disposable check'});
    await request(`/api/users/${rider.id}`,token,400,'PATCH',{action:'ban',reason:''});
    await request(`/api/users/${admin.id}`,token,403,'PATCH',{action:'ban',reason:'Disposable check'});
    await request(`/api/users/${rider.id}`,token,200,'PATCH',{action:'ban',reason:'Disposable restriction check'});
    await request(`/api/users/${rider.id}`,token,200,'PATCH',{action:'unban'});
    await request(`/api/bookings/${waited.id}`,token,400,'PATCH',{action:'cancel'});
    const cancels=await Promise.all([0,1].map(()=>fetch(`http://localhost:3002/api/bookings/${waited.id}`,{method:'PATCH',headers:{cookie:token,'Content-Type':'application/json'},body:JSON.stringify({action:'cancel',reason:'Disposable cancellation check'})})));
    assert.deepEqual(cancels.map(r=>r.status).sort(),[200,409]);
    assert.equal(await db.adminAudit.count({where:{entityId:waited.id,action:'BOOKING_CANCELLED'}}),1);
    const audit=await request('/dashboard/audit?q='+waited.id,token);assert(audit.includes('Disposable cancellation check'));assert(audit.includes(admin.name));
    await db.customerReview.create({data:{bookingId:rows[0].id,customerId:customer.id,riderId:rider.id,rating:4,comment:'Disposable rider profile review'}});
    const profile=await request('/dashboard/riders/'+rider.id,token);assert(profile.includes('Current assignments'));assert(profile.includes('Disposable rider profile review'));assert(profile.includes('Last location update'));
    const reports=await request(`/dashboard/reports?from=${date}&to=${date}`,token);assert(reports.includes('Rider performance'));assert(reports.includes('Cancellation rate'));assert(reports.includes('Completed fare total by booking date'));
    const invalid=await request('/dashboard/reports?from=2026-02-30&to=2026-10-03',token);assert(invalid.includes('Choose valid dates.'));
    console.log('PASS: admin permissions, notifications, pagination, dates/exports, attention, support assignment and preserved replies, concurrency checks, atomic audits, rider profiles and reports.');
    if(process.env.LEAVE_ADMIN_UI_FIXTURES==='1') {fixture.adminEmail=admin.email;fixture.bookingId=rows[0].id;fixture.ticketId=ticket.id;fixture.riderId=rider.id;fixture.date=date;fs.writeFileSync(fixtureFile,JSON.stringify(fixture));keep=true;console.log('UI fixture ready:',admin.email);}
  } finally {if(!keep) await cleanup(fixture);await db.$disconnect();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
