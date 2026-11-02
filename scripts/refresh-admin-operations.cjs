// Additive fictional activity requested by the owner. No outbound delivery,
// live dispatch, credentials, service activation or funds movement occurs here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {parseEnv}=require('node:util'),{PrismaClient}=require('@prisma/client');
const BATCH='admin_operations_20261103_v1',OLD=['demo_activity_20261024_v1_','team_activity_20261029_v1_'];
const NAMES=['Jomar Bautista','Aileen Soriano','Mark Angelo Cruz','Kristine Domingo','Ronald Flores','Jessa Mendoza','Victor Salazar','Camille Navarro','Erwin Santos','Patricia Ramos','Dennis Aquino','Rhea Villanueva'];
const ADVISORIES=[
 ['ANNOUNCEMENT','Shift handover: ownership and response coverage','Start with urgent safety intake, then assigned customer follow-ups. Claim unassigned work before responding. Record a next step for every open case before handing it to another shift.',[]],
 ['ANNOUNCEMENT','Pickup coordination during afternoon rain','Confirm a safe, sheltered pickup landmark with the customer. Do not promise a fixed arrival time when road conditions are changing. Record any agreed pickup instruction in the booking conversation.',[]],
 ['ANNOUNCEMENT','Cash payment reconciliation reminder','Check the payment reference and recorded amounts before preparing a financial review. Completed service and cash collection are separate facts. Record the reason for every Admin correction.',[]],
 ['ANNOUNCEMENT','Safety escalation coverage','The assigned Safety reviewer owns participant updates and investigation follow-up. Use the linked customer conversation for public updates, and private notes for evidence and call outcomes.',['SAFETY','SUPPORT_SUPERVISOR']],
 ['ANNOUNCEMENT','Document review coverage','Review the oldest submitted rider applications first. Request a specific replacement when a document is missing or unreadable. Record attendance and the assessment before the normal service decision.',['SAFETY']],
 ['ANNOUNCEMENT','Customer support handover checklist','Before escalating, summarize the reported issue, checks already completed and the assistance requested. Tell the customer the next step in the same conversation.',['SUPPORT','SUPPORT_SUPERVISOR']],
 ['SAFETY_GUIDE','Calling participants during a safety review','Claim the case, verify the linked customer and rider, and use the saved contact numbers. A dialer launch is only an attempt: record the actual outcome, call time and next step. For immediate danger, advise contacting emergency services.',['SAFETY']],
 ['SAFETY_GUIDE','Public updates and private investigation notes','A public Safety reply belongs in the linked customer conversation. Witness accounts, private phone numbers and unverified allegations belong in internal notes. Ask Admin for actions outside your authority.',['SAFETY']],
 ['KNOWLEDGE','Explaining receipts and payment records','Use the booking reference to locate the saved payment record. Explain what has been confirmed and what remains under review. Never request a password, OTP or private wallet credentials.',['SUPPORT','SUPPORT_SUPERVISOR']],
 ['TEMPLATE','Customer follow-up after a team handoff','Thank you for the details. I have passed the report to the appropriate team. We will keep updates in this conversation and let you know the next step after the review.',['SUPPORT','SUPPORT_SUPERVISOR']],
];
function buildPlan({customers,staff,admin,templates,applicationTemplate,now}){
 const bookings=[],bookingEvents=[],paymentEvents=[],users=[],profiles=[],presence=[],applications=[],applicationEvents=[],resources=[],tickets=[],messages=[],notes=[],cases=[],workflowNotes=[],audits=[];
 const age=minutes=>new Date(now.getTime()-minutes*60000),support=staff.filter(s=>s.role==='SUPPORT'),supervisors=staff.filter(s=>s.role==='SUPPORT_SUPERVISOR'),safety=staff.filter(s=>s.role==='SAFETY');
 const audit=(actor,action,entityType,entityId,details,createdAt=now)=>audits.push({id:`${BATCH}_audit_${audits.length+1}`,actorId:actor.id,actorName:actor.name,action,entityType,entityId,details:{...details,synthetic:true,batch:BATCH,source:'User-requested fictional operating history'},createdAt:new Date(Math.max(createdAt.getTime(),actor.createdAt?.getTime()??0))});
 for(let index=0;index<36;index++){
  const base=templates[index%templates.length],customer=customers[index%customers.length],cancelled=index%6===5,id=`${BATCH}_booking_${index+1}`,refCode=`${base.type==='RIDE'?'RIDE':'FIT'}-${crypto.createHash('sha256').update(id).digest('hex').slice(0,7).toUpperCase()}`;
  const createdAt=age(160+index*17),matchedAt=new Date(createdAt.getTime()+120000),pickedUpAt=cancelled?null:new Date(createdAt.getTime()+7*60000),end=new Date(createdAt.getTime()+(cancelled?5:32)*60000),fare=Number(base.totalFare);
  bookings.push({...base,id,refCode,customerId:customer.id,status:cancelled?'CANCELLED':'DELIVERED',paymentMethod:'CASH',paymentStatus:cancelled?'UNPAID':'PAID',createdAt,updatedAt:end,matchedAt,pickedUpAt,deliveredAt:cancelled?null:end,cancelledAt:cancelled?end:null,cancellationReason:cancelled?'Customer requested rescheduling before pickup.':null,...(!cancelled?{paidAt:end,customerPaidAt:end,riderReceivedAt:end,customerPaidAmount:fare,riderReceivedAmount:fare,paymentReference:`CASH-${refCode}`}:{})});
  const rider={id:base.riderId,name:base.riderName,role:'RIDER'};delete bookings.at(-1).riderName;
  const steps=[['CREATED',null,'PENDING',createdAt,customer],['ASSIGNED','PENDING','MATCHED',matchedAt,admin],...(cancelled?[['CANCELLED','MATCHED','CANCELLED',end,customer]]:[['STATUS_CHANGED','MATCHED','ACCEPTED',new Date(matchedAt.getTime()+60000),rider],['STATUS_CHANGED','ACCEPTED','PICKED_UP',pickedUpAt,rider],['STATUS_CHANGED','PICKED_UP','IN_TRANSIT',new Date(pickedUpAt.getTime()+60000),rider],['STATUS_CHANGED','IN_TRANSIT','DELIVERED',end,rider]])];
  for(const [action,fromStatus,toStatus,at,actor]of steps)bookingEvents.push({id:`${id}_event_${bookingEvents.length}`,bookingId:id,actorId:actor.id,actorName:actor.name,actorRole:actor.role,action,fromStatus,toStatus,riderId:base.riderId,reason:`Generated operating history (${BATCH}).`,createdAt:at});
  if(!cancelled){paymentEvents.push({id:`${id}_cash`,bookingId:id,actorId:admin.id,actorName:admin.name,actorRole:'ADMIN',action:'ADMIN_REVIEWED',amount:fare,fromStatus:'UNPAID',toStatus:'PAID',reference:`CASH-${refCode}`,reason:`Generated completed cash booking reconciled as paid (${BATCH}); no funds moved.`,createdAt:end});audit(admin,'PAYMENT_UPDATED','BOOKING',id,{status:'PAID',reference:`CASH-${refCode}`},end);}
  audit(admin,'BOOKING_REVIEWED','BOOKING',id,{status:bookings.at(-1).status},end);
 }
 for(let index=0;index<12;index++){
  const name=NAMES[index],userId=`${BATCH}_applicant_${index+1}`,id=`${BATCH}_application_${index+1}`,actor=safety[index%safety.length],status=index<3?'DRAFT':index<7?'SUBMITTED':index<10?'IN_REVIEW':'NEEDS_CORRECTION';
  const createdAt=age(90+index*7),updatedAt=new Date(Math.max(age(10+index).getTime(),actor.createdAt.getTime())),fields={...applicationTemplate.fields,legalName:name,activityBatch:BATCH,synthetic:true,licenceNumber:`REF-${700+index}`,plateNumber:`REF-${800+index}`,address:['Poblacion, Lingayen','Libsong, Lingayen','Poblacion, Binmaley'][index%3]+', Pangasinan',emergencyName:`${['Marissa','Celia','Renato'][index%3]} ${name.split(' ').at(-1)}`,mobile:`0900000${String(301+index)}`};
  users.push({id:userId,name,email:`applicant-${index+1}@operations.fetchit.invalid`,role:'RIDER',createdAt,updatedAt});
  profiles.push({userId,vehicleClass:'MOTORCYCLE',vehiclePlate:fields.plateNumber,totalDeliveries:0,rating:5});presence.push({userId,isOnline:false});
  applications.push({id,userId,isDemo:true,status,vehicleClass:'MOTORCYCLE',services:['DELIVERY'],fields,fieldReviews:status==='NEEDS_CORRECTION'?{vehicle:{status:'NEEDS_CORRECTION',reason:'Please upload the readable current vehicle registration and complete the document checklist.',reviewerId:actor.id}}:{},assignedToId:['IN_REVIEW','NEEDS_CORRECTION'].includes(status)?actor.id:null,version:status==='DRAFT'?1:status==='SUBMITTED'?2:3,submittedAt:status==='DRAFT'?null:new Date(createdAt.getTime()+5*60000),createdAt,updatedAt});
  applicationEvents.push({id:`${id}_opened`,applicationId:id,actorId:userId,actorName:name,action:'STARTED',details:{synthetic:true,batch:BATCH},createdAt});
  if(status!=='DRAFT')applicationEvents.push({id:`${id}_submitted`,applicationId:id,actorId:userId,actorName:name,action:'SUBMITTED',details:{synthetic:true,batch:BATCH,pendingDocuments:true},createdAt:new Date(createdAt.getTime()+5*60000)});
  if(applications.at(-1).assignedToId){applicationEvents.push({id:`${id}_review`,applicationId:id,actorId:actor.id,actorName:actor.name,action:status==='NEEDS_CORRECTION'?'CORRECTIONS_REQUESTED':'CLAIMED',details:{synthetic:true,batch:BATCH,reason:'Document uploads are pending review; no services are approved.'},createdAt:updatedAt});audit(actor,'APPLICATION_REVIEWED','APPLICATION',id,{status,pendingDocuments:true},updatedAt);}
 }
 ADVISORIES.forEach(([kind,title,body,audienceRoles],index)=>{const id=`${BATCH}_resource_${index+1}`;resources.push({id,kind,title,body,audienceRoles,version:1,updatedById:admin.id,createdAt:age(5+index),updatedAt:age(5+index)});audit(admin,'RESOURCE_PUBLISHED','RESOURCE',id,{kind,title},age(5+index));});
 for(let index=0;index<12;index++){
  const booking=bookings.filter(b=>b.status==='DELIVERED')[index],customer=customers.find(c=>c.id===booking.customerId),actor=support[index%support.length],id=`${BATCH}_ticket_${index+1}`,createdAt=age(65+index),updatedAt=new Date(Math.max(age(index+2).getTime(),actor.createdAt.getTime())),resolved=index>=8&&index%4===3;
  const issue=['Please confirm the parcel handover instructions.','Please help me locate the receipt for this booking.','I would like the rider communication reviewed.','Please clarify how to update my saved pickup landmark.'][index%4];
  tickets.push({id,customerId:customer.id,bookingId:booking.id,category:index%4===2?'RIDER':'OTHER',message:issue,status:resolved?'RESOLVED':'IN_PROGRESS',priority:index%3===0?'HIGH':'NORMAL',assignedAdminId:actor.id,createdAt,updatedAt,lastCustomerMessageAt:createdAt,lastAdminReplyAt:updatedAt});
  messages.push({id:`${id}_customer`,ticketId:id,authorId:customer.id,authorName:customer.name,authorRole:'CUSTOMER',body:issue,createdAt},{id:`${id}_reply`,ticketId:id,authorId:actor.id,authorName:actor.name,authorRole:actor.role,body:resolved?'The requested guidance has been recorded. You can return to this conversation if you need any further help.':'Thank you for the details. I am checking the booking context and will keep the next update in this conversation.',createdAt:updatedAt});
  notes.push({id:`${id}_note`,ticketId:id,authorId:actor.id,authorName:actor.name,body:'Booking reference checked. Keep customer updates public and investigation details internal.',createdAt:updatedAt});audit(actor,resolved?'SUPPORT_RESOLVE':'SUPPORT_REPLY','SUPPORT',id,{status:tickets.at(-1).status},updatedAt);
  if(index<8){
   const kind=index%2?'SAFETY':'ESCALATION',receiver=(kind==='SAFETY'?safety:supervisors)[index%(kind==='SAFETY'?safety:supervisors).length],caseId=`${BATCH}_case_${index+1}`,status=index%3===0?'AWAITING_ADMIN':'IN_REVIEW',at=new Date(Math.max(updatedAt.getTime(),receiver.createdAt.getTime()));
   cases.push({id:caseId,kind,title:kind==='SAFETY'?'Rider communication and handover follow-up':'Customer follow-up coordination',summary:`${issue}\nSupport checked the booking reference and requested a coordinated team follow-up.`,priority:index===1?'HIGH':'NORMAL',status,bookingId:booking.id,ticketId:id,subjectUserId:customer.id,assignedToId:receiver.id,createdById:actor.id,createdByName:actor.name,recommendation:status==='AWAITING_ADMIN'?'Authorize a coordinated customer/rider follow-up and record the outcome. No financial adjustment or account restriction is requested.':null,version:status==='AWAITING_ADMIN'?3:2,createdAt:at,updatedAt:at});
   workflowNotes.push({id:`${caseId}_note`,caseId,authorId:receiver.id,authorName:receiver.name,body:'Review the linked customer conversation, contact participants as needed and keep a clear next step.',createdAt:at});audit(receiver,'CASE_NOTE','CASE',caseId,{internal:true},at);
  }
 }
 return{bookings,bookingEvents,paymentEvents,users,profiles,presence,applications,applicationEvents,resources,tickets,messages,notes,cases,workflowNotes,audits};
}
async function main(){
 const root=path.resolve(__dirname,'..'),folder=path.join(root,'tmp/admin-operations');fs.mkdirSync(folder,{recursive:true});
 const config=parseEnv(fs.readFileSync('C:/Users/Z/Downloads/fetch-admin/.env','utf8')),restricted=parseEnv(fs.readFileSync('C:/Users/Z/Downloads/fetch-admin/.env.production.repair.local','utf8'));
 const target=new URL(config.DATABASE_URL),live=new URL(restricted.DATABASE_URL);assert.equal(target.hostname,live.hostname);assert.equal(target.pathname,live.pathname);assert(!target.searchParams.get('schema')||target.searchParams.get('schema')==='public');process.env.DATABASE_URL=config.DATABASE_URL;
 const db=new PrismaClient();
 try{
  assert.equal((await db.$queryRaw`SELECT current_schema() AS schema`)[0].schema,'public');
  const admin=await db.user.findUnique({where:{email:'fetchitadmin@gmail.com'},select:{id:true,name:true,role:true,createdAt:true}});assert.equal(admin?.role,'ADMIN');
  const marker=await db.adminAudit.findUnique({where:{id:`BATCH_${BATCH}`}});if(marker){console.log(JSON.stringify({alreadyApplied:true,...marker.details}));return;}
  const staff=await db.user.findMany({where:{email:{endsWith:'@staff.fetchit.invalid'},role:{in:['SUPPORT','SUPPORT_SUPERVISOR','SAFETY']},isBanned:false},select:{id:true,name:true,role:true,createdAt:true}});assert.equal(staff.length,8);
  const manifest=JSON.parse(fs.readFileSync('C:/Users/Z/Downloads/fetch-customer/local-defense-users.json','utf8'));assert.equal(manifest.synthetic,true);
  const customers=await db.user.findMany({where:{id:{in:manifest.users.slice(40,64).map(c=>c.id)},role:'CUSTOMER',isBanned:false},select:{id:true,name:true,role:true,createdAt:true}});assert.equal(customers.length,24);
  const templates=await db.booking.findMany({where:{id:{startsWith:'team_activity_20261029_v1_booking_'},status:'DELIVERED'},take:6,select:{type:true,riderId:true,pickupLabel:true,pickupLat:true,pickupLng:true,dropoffLabel:true,dropoffLat:true,dropoffLng:true,vehicleClass:true,cargoWeightKg:true,passengers:true,cargoNotes:true,distanceKm:true,baseFare:true,totalFare:true,surgeMultiplier:true,etaMinutes:true,rider:{select:{name:true}}}});assert.equal(templates.length,6);
  const applicationTemplate=await db.riderApplication.findFirst({where:{id:{startsWith:'team_activity_20261029_v1_application_'}},select:{fields:true}});assert(applicationTemplate);
  const now=new Date(),plan=buildPlan({customers,staff,admin,templates:templates.map(({rider,...b})=>({...b,riderName:rider.name})),applicationTemplate,now});
  const oldWhere={OR:OLD.map(prefix=>({id:{startsWith:prefix}})),status:'DELIVERED',paymentMethod:'CASH',paymentStatus:'UNPAID'};
  const unpaid=await db.booking.findMany({where:oldWhere,select:{id:true,refCode:true,totalFare:true,paymentStatus:true}});
  const riders=await db.user.findMany({where:{id:{startsWith:OLD[0]},role:'RIDER',name:{startsWith:'Demo · '},email:{endsWith:'.invalid'}},select:{id:true,name:true}});
  const counts={paidCorrections:unpaid.length,renamedRiders:riders.length,bookings:plan.bookings.length,completedPaid:plan.bookings.filter(b=>b.status==='DELIVERED').length,applications:plan.applications.length,resources:plan.resources.length,tickets:plan.tickets.length,cases:plan.cases.length};
  fs.writeFileSync(path.join(folder,'preflight.json'),JSON.stringify({batch:BATCH,counts,unpaid,riders},null,2));
  if(!process.argv.includes('--apply')){console.log(JSON.stringify({dryRun:true,batch:BATCH,...counts}));return;}
  assert.equal(process.env.APPLY_ADMIN_OPERATIONS,BATCH);
  await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${BATCH}))::text`;assert.equal(await tx.adminAudit.count({where:{id:`BATCH_${BATCH}`}}),0);
   for(const old of unpaid){
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id"=${old.id} FOR UPDATE`;
    const current=await tx.booking.findUniqueOrThrow({where:{id:old.id}});assert.equal(current.status,'DELIVERED');assert.equal(current.paymentStatus,'UNPAID');assert.equal(current.paymentMethod,'CASH');
    const reference=`REC-${BATCH}-${old.refCode}`,reason='Owner requested Paid status for generated completed cash history. Administrative sample correction; not a customer/rider confirmation and no funds transferred.';
    await tx.booking.update({where:{id:old.id},data:{paymentStatus:'PAID',paidAt:now,paymentReference:reference}});
    await tx.paymentEvent.create({data:{bookingId:old.id,actorId:admin.id,actorName:admin.name,actorRole:'ADMIN',action:'ADMIN_REVIEWED',fromStatus:'UNPAID',toStatus:'PAID',amount:old.totalFare,reference,reason}});
    await tx.adminAudit.create({data:{actorId:admin.id,actorName:admin.name,action:'PAYMENT_UPDATED',entityType:'BOOKING',entityId:old.id,details:{fromStatus:'UNPAID',status:'PAID',reason,reference,synthetic:true,batch:BATCH}}});
   }
   for(const rider of riders){const name=rider.name.replace(/^Demo · /,'');await tx.user.update({where:{id:rider.id},data:{name}});await tx.adminAudit.create({data:{actorId:admin.id,actorName:admin.name,action:'RIDER_DISPLAY_NAME_UPDATED',entityType:'USER',entityId:rider.id,details:{from:rider.name,to:name,synthetic:true,batch:BATCH}}});}
   await tx.user.createMany({data:plan.users});await tx.riderProfile.createMany({data:plan.profiles});await tx.riderPresence.createMany({data:plan.presence});
   await tx.booking.createMany({data:plan.bookings});await tx.bookingEvent.createMany({data:plan.bookingEvents});await tx.paymentEvent.createMany({data:plan.paymentEvents});
   await tx.supportTicket.createMany({data:plan.tickets});await tx.supportMessage.createMany({data:plan.messages});await tx.supportInternalNote.createMany({data:plan.notes});
   await tx.workflowCase.createMany({data:plan.cases});await tx.workflowNote.createMany({data:plan.workflowNotes});
   await tx.riderApplication.createMany({data:plan.applications});await tx.riderApplicationEvent.createMany({data:plan.applicationEvents});await tx.staffResource.createMany({data:plan.resources});await tx.adminAudit.createMany({data:plan.audits});
   for(const riderId of new Set(plan.bookings.map(b=>b.riderId))){const completed=plan.bookings.filter(b=>b.riderId===riderId&&b.status==='DELIVERED').length;await tx.riderProfile.update({where:{userId:riderId},data:{totalDeliveries:{increment:completed}}});}
   await tx.adminAudit.create({data:{id:`BATCH_${BATCH}`,actorId:admin.id,actorName:admin.name,action:'OPERATING_HISTORY_CREATED',entityType:'STAFF',entityId:BATCH,details:{synthetic:true,batch:BATCH,...counts}}});
  },{timeout:120000});
  console.log(JSON.stringify({applied:true,batch:BATCH,...counts}));
 }finally{await db.$disconnect();}
}
if(require.main===module)main().catch(error=>{console.error('Admin history update failed:',error.code||error.message);process.exitCode=1;});
module.exports={BATCH,buildPlan};
