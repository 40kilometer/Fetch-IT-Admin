// Opt-in admin check in a fresh disposable schema. Never writes application data.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
if(process.env.RUN_ADMIN_INTEGRATION!=='1') throw new Error('Set RUN_ADMIN_INTEGRATION=1.');
const root = path.resolve(__dirname, '..');
const customerRoot = path.resolve(root, '../fetch-customer');
process.loadEnvFile(path.join(root, '.env'));
const schema = 'fetch_admin_test_' + crypto.randomUUID().replaceAll('-', '');
const target = new URL(process.env.DATABASE_URL);
target.searchParams.set('schema', schema);
target.searchParams.set('options', `${target.searchParams.get('options') || ''} -c search_path=${schema},pg_catalog`.trim());
const databaseUrl = target.toString();
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const sessionSecret = crypto.randomBytes(32).toString('hex');
const port = 3222;
let server, ownsSchema = false;
const fixture = {marker:'ops-check-'+crypto.randomUUID(),users:[],bookings:[]};
const password='Disposable-UI-Check-2026!';
function cookie(user) {
  const payload=Buffer.from(JSON.stringify({uid:user.id,email:user.email,name:user.name,exp:Date.now()+600000})).toString('base64url');
  return 'fetchit_admin_session='+payload+'.'+crypto.createHmac('sha256',sessionSecret).update(payload).digest('base64url');
}
async function request(path,token,expected=200,method="GET",data) {
  const res=await fetch(`http://localhost:${port}`+path,{method,headers:{...(token?{cookie:token}:{}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),redirect:'manual',signal:AbortSignal.timeout(30000)});
  const body=await res.text(); assert.equal(res.status,expected,body.slice(0,150));
  return res.headers.get('content-type')?.includes('application/json')?JSON.parse(body):body;
}
async function prepare() {
  assert.equal((await db.$queryRaw`SELECT nspname FROM pg_namespace WHERE nspname = ${schema}`).length, 0);
  ownsSchema = true;
  const migration = spawnSync(process.execPath, [path.join(customerRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: customerRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, windowsHide: true, encoding: 'utf8', timeout: 90000 });
  assert.equal(migration.status, 0, 'Disposable admin schema migrations must succeed.');
  assert((await db.$queryRaw`SHOW search_path`)[0].search_path.includes(schema));
  const functions = await db.$queryRaw`SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = ${schema}`;
  for (const fn of functions) {
    assert(/^fetch_[a-z_]+$/.test(fn.name));
    await db.$executeRawUnsafe(`ALTER FUNCTION "${schema}"."${fn.name}"() SET search_path TO "${schema}", pg_catalog`);
  }
  server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port)], {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl, ADMIN_SESSION_SECRET: sessionSecret }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.resume(); server.stderr.resume();
  for (let attempt = 0; attempt < 60; attempt++) {
    assert.equal(server.exitCode, null, 'Admin test server must stay running.');
    try { await fetch(`http://localhost:${port}/login`, { signal: AbortSignal.timeout(1000) }); return; } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('Admin test server did not become ready.');
}
async function user(role) {
  const salt=crypto.randomBytes(16).toString('hex');
  const email = `${fixture.marker}-${role.toLowerCase()}@example.invalid`;
  const saved=await db.user.create({data:{name:'Operations check',email,role,
    authIdentities:{create:{provider:'PASSWORD',providerUserId:email,passwordHash:salt+':'+crypto.scryptSync(password,salt,64).toString('hex')}},
    ...(role==='RIDER'?{riderProfile:{create:{vehicleClass:'TRICYCLE'}},riderPresence:{create:{isOnline:true}}}:{})}});
  fixture.users.push(saved.id); return saved;
}
(async()=>{
  try {
    await prepare();
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
    const waited={...base,id:crypto.randomUUID(),refCode:fixture.marker+'-waiting',status:'PENDING',riderId:null,createdAt:new Date(now-600000),updatedAt:new Date(now-600000),deliveredAt:null,pickedUpAt:null,matchedAt:null};
    const future={...waited,id:crypto.randomUUID(),refCode:fixture.marker+'-future',scheduledAt:new Date(now.getTime()+86400000)};
    const stalled={...waited,id:crypto.randomUUID(),refCode:fixture.marker+'-stalled',status:'MATCHED',riderId:rider.id,matchedAt:new Date(now-3600000),updatedAt:new Date(now-3600000)};
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
    const previousReply = await db.supportMessage.create({data:{ticketId:ticket.id,authorId:admin.id,authorName:admin.name,authorRole:'ADMIN',body:'Previous fixture reply'}});
    ticket=await db.supportTicket.update({where:{id:ticket.id},data:{lastAdminReplyAt:previousReply.createdAt}});
    const supportData={status:'IN_PROGRESS',reply:'First new fixture reply',priority:'URGENT',assignedAdminId:admin.id,updatedAt:ticket.updatedAt.toISOString()};
    const changed=await request(`/api/support/${ticket.id}`,token,200,'PATCH',supportData);
    await request(`/api/support/${ticket.id}`,token,409,'PATCH',supportData);
    const next=await request(`/api/support/${ticket.id}`,token,200,'PATCH',{...supportData,reply:'Second fixture reply',updatedAt:changed.ticket.updatedAt});
    await request(`/api/support/${ticket.id}`,token,200,'PATCH',{...supportData,status:'RESOLVED',reply:'',updatedAt:next.ticket.updatedAt});
    const history=await db.supportMessage.findMany({where:{ticketId:ticket.id},orderBy:{createdAt:'asc'}});
    assert.equal(history.length,3);assert.equal(history[0].body,'Previous fixture reply');
    assert.equal(history[2].body,'Second fixture reply');
    assert.equal((await db.supportTicket.findUnique({where:{id:ticket.id}})).lastAdminReplyAt.getTime(),history[2].createdAt.getTime());
    const conversation=await request('/dashboard/support/'+ticket.id,token);assert(conversation.includes('Previous fixture reply'));assert(conversation.includes('Second fixture reply'));assert(conversation.includes('URGENT'));
    await request(`/api/users/${rider.id}`,cookie(customer),401,'PATCH',{action:'ban',reason:'Disposable check'});
    await request(`/api/users/${rider.id}`,token,400,'PATCH',{action:'ban',reason:''});
    await request(`/api/users/${admin.id}`,token,403,'PATCH',{action:'ban',reason:'Disposable check'});
    await request(`/api/users/${rider.id}`,token,200,'PATCH',{action:'ban',reason:'Disposable restriction check'});
    await request(`/api/users/${rider.id}`,token,200,'PATCH',{action:'unban'});
    await request(`/api/bookings/${waited.id}`,token,400,'PATCH',{action:'cancel'});
    const cancels=await Promise.all([0,1].map(()=>fetch(`http://localhost:${port}/api/bookings/${waited.id}`,{method:'PATCH',headers:{cookie:token,'Content-Type':'application/json'},body:JSON.stringify({action:'cancel',reason:'Disposable cancellation check'}),signal:AbortSignal.timeout(30000)})));
    assert.deepEqual(cancels.map(r=>r.status).sort(),[200,409]);
    assert.equal(await db.adminAudit.count({where:{entityId:waited.id,action:'BOOKING_CANCELLED'}}),1);
    const audit=await request('/dashboard/audit?q='+waited.id,token);assert(audit.includes('Disposable cancellation check'));assert(audit.includes(admin.name));
    await db.customerReview.create({data:{bookingId:rows[0].id,customerId:customer.id,riderId:rider.id,rating:4,comment:'Disposable rider profile review'}});
    const profile=await request('/dashboard/riders/'+rider.id,token);assert(profile.includes('Current assignments'));assert(profile.includes('Disposable rider profile review'));assert(profile.includes('Last location update'));
    const reports=await request(`/dashboard/reports?from=${date}&to=${date}`,token);assert(reports.includes('Rider performance'));assert(reports.includes('Cancellation rate'));assert(reports.includes('Completed fare total by booking date'));
    const invalid=await request('/dashboard/reports?from=2026-02-30&to=2026-10-03',token);assert(invalid.includes('Choose valid dates.'));
    console.log('PASS: admin permissions, notifications, pagination, dates/exports, attention, support assignment and preserved replies, concurrency checks, atomic audits, rider profiles and reports.');
  } finally {
    if (server) server.kill();
    try {
      if (ownsSchema) {
        assert(/^fetch_admin_test_[a-f0-9]{32}$/.test(schema));
        await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    } finally { await db.$disconnect(); }
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
