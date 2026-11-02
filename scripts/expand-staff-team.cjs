// Explicit, additive setup for the user's requested fictional operating team.
// No bookings, notifications, deliveries, applications or service grants are created.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {parseEnv}=require('node:util');
const {PrismaClient}=require('@prisma/client');
const BATCH='team_operations_20261102_v1';
const NEW_STAFF=[
  {name:'Mia Reyes',email:'mia.reyes@staff.fetchit.invalid',role:'SUPPORT'},
  {name:'Paolo Mendoza',email:'paolo.mendoza@staff.fetchit.invalid',role:'SUPPORT'},
  {name:'Carla Navarro',email:'carla.navarro@staff.fetchit.invalid',role:'SUPPORT_SUPERVISOR'},
  {name:'Miguel Ramos',email:'miguel.ramos@staff.fetchit.invalid',role:'SAFETY'},
  {name:'Andrea Villanueva',email:'andrea.villanueva@staff.fetchit.invalid',role:'SAFETY'},
].map((person,index)=>({id:`${BATCH}_staff_${index+1}`,...person}));
const EXISTING=['cs@staff.fetchit.invalid','cs-supervisor@staff.fetchit.invalid','safety@staff.fetchit.invalid'];
const TOPICS=[
  ['OTHER','Update contact instructions','Could you help me update my delivery contact instructions? Please use the side gate and call when you arrive.','I can guide you through updating your saved instructions. Please confirm the wording you want to use; no password or verification code is needed.'],
  ['OTHER','Receipt and expense guidance','Where can I find my receipt and fare breakdown for an office expense claim?','Open the completed booking and choose the receipt or fare details. If the reference is missing, send the booking reference here so we can check it.'],
  ['RIDER','Rider communication follow-up','I would like someone to follow up on how my pickup instructions were communicated.','Thank you for raising this. I have recorded your concern and will coordinate a review of the communication before giving you a further update.'],
  ['OTHER','Saved address correction','My saved address uses the old street name. How do I correct the landmark for my next request?','Please update the saved address before your next booking and include a clear landmark. I can help you check the instructions without changing any active trip.'],
  ['OTHER','Notification preferences','Can you explain which updates I will receive while a delivery is in progress?','Booking progress appears in your account. Device alerts depend on your notification permissions. Keep the booking page open to see the latest recorded status.'],
  ['LOST_ITEM','Lost item follow-up','I may have left a reusable bottle after a trip. What information do you need to help check?','Please share the booking reference, a description of the bottle and where you last saw it. We will coordinate the follow-up without sharing private contact details.'],
  ['OTHER','Account profile guidance','I need help correcting the spelling of the contact name on my profile.','Please open your account profile and update the display name. Your sign-in email stays separate. Tell us if you see an error when saving.'],
  ['OTHER','Support follow-up preference','Could the team keep the follow-up in this conversation so I can track the next steps?','Yes. We will keep the support updates in this conversation and record any internal handoff separately. You can return here for the next update.'],
];
function buildActivity({customers,staff,admin,now}) {
  const tickets=[],messages=[],notes=[],cases=[],workflowNotes=[],audits=[];
  const support=staff.filter(s=>['SUPPORT','SUPPORT_SUPERVISOR'].includes(s.role)),supervisors=staff.filter(s=>s.role==='SUPPORT_SUPERVISOR'),safety=staff.filter(s=>s.role==='SAFETY');
  assert.equal(customers.length,24);assert.equal(support.length,5);assert.equal(safety.length,3);
  const date=(actor,offset)=>new Date(Math.min(now.getTime(),Math.max(now.getTime()-offset*60000,new Date(actor.createdAt).getTime())));
  const audit=(actor,action,entityType,entityId,details,createdAt)=>audits.push({id:`${BATCH}_audit_${audits.length+1}`,actorId:actor.id,actorName:actor.name,action,entityType,entityId,details:{...details,synthetic:true,batch:BATCH,source:'User-requested fictional operating history'},createdAt});
  for(let index=0;index<24;index++) {
    const customer=customers[index],actor=support[index%support.length],topic=TOPICS[index%TOPICS.length],id=`${BATCH}_ticket_${index+1}`;
    const unassigned=index%7===0,resolved=!unassigned&&index%6===5;
    const createdAt=date(customer,180+index*12),replyAt=date(actor,120+index*12),noteAt=date(actor,110+index*12);
    const status=unassigned?'OPEN':resolved?'RESOLVED':'IN_PROGRESS';
    messages.push({id:`${id}_message_01`,ticketId:id,authorId:customer.id,authorName:customer.name,authorRole:'CUSTOMER',body:topic[2],createdAt});
    if(!unassigned) {
      messages.push({id:`${id}_message_02`,ticketId:id,authorId:actor.id,authorName:actor.name,authorRole:actor.role,body:topic[3]+(resolved?' The requested guidance is complete. You can reply here if you need more help.':''),createdAt:replyAt});
      notes.push({id:`${id}_note`,ticketId:id,authorId:actor.id,authorName:actor.name,body:resolved?'Guidance provided and the request resolved. No booking, account restriction or payment change was made.':'Account context checked. Follow up in this thread and retain the customer’s instructions. Escalate only if additional review is needed.',createdAt:noteAt});
      audit(actor,'SUPPORT_CLAIM','SUPPORT',id,{from:'OPEN',status:'IN_PROGRESS',previousAssignedAdminId:null,assignedAdminId:actor.id},replyAt);
      audit(actor,resolved?'SUPPORT_RESOLVE':'SUPPORT_REPLY','SUPPORT',id,{from:'IN_PROGRESS',status,assignedAdminId:actor.id,replyAdded:true},replyAt);
      audit(actor,'SUPPORT_NOTE_ADDED','SUPPORT',id,{note:notes.at(-1).body},noteAt);
    }
    tickets.push({id,customerId:customer.id,bookingId:null,category:topic[0],message:topic[2],status,priority:index%5===2?'HIGH':'NORMAL',assignedAdminId:unassigned?null:actor.id,createdAt,updatedAt:unassigned?createdAt:noteAt,lastCustomerMessageAt:createdAt,lastAdminReplyAt:unassigned?null:replyAt});
  }
  const linked=tickets.filter(t=>t.assignedAdminId&&t.status!=='RESOLVED');
  for(let index=0;index<10;index++) {
    const ticket=linked[index],kind=index<5?'ESCALATION':'SAFETY',reviewers=kind==='ESCALATION'?supervisors:safety,actor=reviewers[(index%5)%reviewers.length],creator=staff.find(s=>s.id===ticket.assignedAdminId);
    const stages=kind==='SAFETY'?['IN_REVIEW','AWAITING_ADMIN','IN_REVIEW','OPEN','RESOLVED']:['IN_REVIEW','AWAITING_ADMIN','OPEN','IN_REVIEW','RESOLVED'];
    const status=stages[index%5],assigned=status!=='OPEN';
    const id=`${BATCH}_case_${index+1}`,createdAt=date(creator,80+index*4),updatedAt=new Date(Math.max(createdAt.getTime(),date(actor,30+index*2).getTime()));
    const recommendation=status==='AWAITING_ADMIN'?'Review the recorded communication and authorize a coordinated customer follow-up. No payment or account restriction is requested.':null;
    cases.push({id,kind,title:(kind==='ESCALATION'?'Customer follow-up: ':'Safety follow-up: ')+TOPICS[tickets.indexOf(ticket)%TOPICS.length][1],summary:`Customer context: ${ticket.message}\nSupport has provided initial guidance. Review the linked conversation and record the next follow-up. No operational change has been performed.`,priority:index%3===0?'HIGH':'NORMAL',status,bookingId:null,ticketId:ticket.id,subjectUserId:ticket.customerId,createdById:creator.id,createdByName:creator.name,assignedToId:assigned?actor.id:null,recommendation,version:status==='OPEN'?1:status==='RESOLVED'?4:status==='AWAITING_ADMIN'?3:2,createdAt,updatedAt});
    audit(creator,'CASE_CREATED','CASE',id,{kind,ticketId:ticket.id},createdAt);
    if(assigned) {
      workflowNotes.push({id:`${id}_note`,caseId:id,authorId:actor.id,authorName:actor.name,body:status==='RESOLVED'?'The communication review is complete. Guidance was recorded; no financial adjustment or account restriction was made.':'Reviewed the linked support conversation. Keep the customer informed through the request owner and record any evidence before deciding the next action.',createdAt:updatedAt});
      audit(actor,'CASE_CLAIM','CASE',id,{from:'OPEN',to:'IN_REVIEW',assignedToId:actor.id},updatedAt);
      audit(actor,'CASE_NOTE','CASE',id,{note:workflowNotes.at(-1).body},updatedAt);
      if(recommendation)audit(actor,'CASE_RECOMMEND','CASE',id,{from:'IN_REVIEW',to:'AWAITING_ADMIN',recommendation},updatedAt);
      if(status==='RESOLVED') {
        // Safety closure preserves the independent Admin recommendation gate.
        if(kind==='SAFETY') {
          Object.assign(cases.at(-1),{recommendation:'Complete the documented communication follow-up; no service activation or account restriction.',decision:'Approved the documented follow-up only.',decidedById:admin.id,decidedAt:updatedAt,version:5});
          audit(actor,'CASE_RECOMMEND','CASE',id,{from:'IN_REVIEW',to:'AWAITING_ADMIN',recommendation:cases.at(-1).recommendation},updatedAt);
          audit(admin,'CASE_DECIDE','CASE',id,{from:'AWAITING_ADMIN',to:'APPROVED',reason:cases.at(-1).decision},updatedAt);
        }
        audit(actor,'CASE_CLOSE','CASE',id,{from:kind==='SAFETY'?'APPROVED':'IN_REVIEW',to:'RESOLVED',reason:workflowNotes.at(-1).body},updatedAt);
      }
    }
  }
  return {tickets,messages,notes,cases,workflowNotes,audits};
}
async function main() {
  const root=path.resolve(__dirname,'..'),adminRoot='C:/Users/Z/Downloads/fetch-admin',output=path.join(root,'tmp/staff-team');fs.mkdirSync(output,{recursive:true});
  const owner=parseEnv(fs.readFileSync(path.join(adminRoot,'.env'),'utf8')),restricted=parseEnv(fs.readFileSync(path.join(adminRoot,'.env.production.repair.local'),'utf8'));
  const target=new URL(restricted.DATABASE_URL),configured=new URL(owner.DATABASE_URL);
  assert.equal(target.hostname,configured.hostname);assert.equal(target.pathname,configured.pathname);assert(!configured.searchParams.get('schema')||configured.searchParams.get('schema')==='public');
  process.env.DATABASE_URL=owner.DATABASE_URL;
  const db=new PrismaClient();
  try {
    const [context]=await db.$queryRaw`SELECT current_schema() AS schema`;assert.equal(context.schema,'public');
    const manifest=JSON.parse(fs.readFileSync('C:/Users/Z/Downloads/fetch-customer/local-defense-users.json','utf8'));assert.equal(manifest.synthetic,true);
    const ids=Array.from({length:24},(_,index)=>manifest.users[Math.floor(index*manifest.users.length/24)].id);
    const customers=await db.user.findMany({where:{id:{in:ids},role:'CUSTOMER',isBanned:false},select:{id:true,name:true,createdAt:true}});assert.equal(customers.length,24);
    const staff=await db.user.findMany({where:{email:{in:EXISTING}},select:{id:true,name:true,email:true,role:true,isBanned:true,createdAt:true}});assert.equal(staff.length,3);assert(staff.every(s=>!s.isBanned));
    const admin=await db.user.findUnique({where:{email:'fetchitadmin@gmail.com'},select:{id:true,name:true,role:true,isBanned:true}});assert(admin?.role==='ADMIN'&&!admin.isBanned);
    const existing=await db.user.findMany({where:{OR:[{id:{in:NEW_STAFF.map(s=>s.id)}},{email:{in:NEW_STAFF.map(s=>s.email)}}]},select:{id:true,email:true,role:true,isBanned:true}});
    const applied=await db.adminAudit.findUnique({where:{id:`${BATCH}_applied`}});
    if(applied){assert.equal(existing.length,5);console.log(JSON.stringify({alreadyApplied:true,batch:BATCH,...applied.details.counts}));return;}
    assert.equal(existing.length,0,'Conflicting accounts found; do not change credentials or overwrite a partial batch.');
    const counts={newStaff:5,reusedStaff:3,customers:24,tickets:24,cases:10,bookings:0,notifications:0,serviceGrants:0};
    if(!process.argv.includes('--apply')){console.log(JSON.stringify({dryRun:true,batch:BATCH,...counts,newAccounts:NEW_STAFF.map(({id,...person})=>person)}));return;}
    assert.equal(process.env.APPLY_STAFF_TEAM,BATCH,'Apply requires the exact reviewed batch.');
    const credentialsFile=path.join(output,'credentials-private.json');
    let credentials;
    if(fs.existsSync(credentialsFile))credentials=JSON.parse(fs.readFileSync(credentialsFile,'utf8'));
    else {credentials={batch:BATCH,accounts:NEW_STAFF.map(person=>({...person,password:crypto.randomBytes(18).toString('base64url')}))};fs.writeFileSync(credentialsFile,JSON.stringify(credentials,null,2),{mode:0o600,flag:'wx'});}
    assert.equal(credentials.batch,BATCH);assert.deepEqual(credentials.accounts.map(a=>({id:a.id,name:a.name,email:a.email,role:a.role})),NEW_STAFF);
    const baseline=await Promise.all([db.booking.count(),db.customerNotification.count(),db.riderServiceApproval.count(),db.riderApplicationEmail.count()]);
    await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${BATCH}))::text`;
      assert.equal(await tx.adminAudit.count({where:{id:`${BATCH}_applied`}}),0);
      const added=[];
      for(const account of credentials.accounts) {
        assert(account.password.length>=14);
        const salt=crypto.randomBytes(16).toString('hex'),passwordHash=salt+':'+crypto.scryptSync(account.password,salt,64).toString('hex');
        const user=await tx.user.create({data:{id:account.id,name:account.name,email:account.email,role:account.role,authIdentities:{create:{provider:'PASSWORD',providerUserId:account.email,passwordHash}}}});added.push(user);
        await tx.adminAudit.create({data:{id:`${account.id}_created`,actorId:admin.id,actorName:admin.name,action:'STAFF_CREATED',entityType:'STAFF',entityId:user.id,details:{role:user.role,email:user.email,batch:BATCH,source:'User-requested staff account provisioning'}}});
      }
      const plan=buildActivity({customers,staff:[...staff,...added],admin,now:new Date()});
      await tx.supportTicket.createMany({data:plan.tickets});await tx.supportMessage.createMany({data:plan.messages});await tx.supportInternalNote.createMany({data:plan.notes});
      await tx.workflowCase.createMany({data:plan.cases});await tx.workflowNote.createMany({data:plan.workflowNotes});await tx.adminAudit.createMany({data:plan.audits});
      await tx.adminAudit.create({data:{id:`${BATCH}_applied`,actorId:admin.id,actorName:admin.name,action:'TEAM_ACTIVITY_CREATED',entityType:'STAFF',entityId:BATCH,details:{synthetic:true,batch:BATCH,source:'User-requested fictional operating history',counts:{...counts,messages:plan.messages.length,notes:plan.notes.length,auditEvents:plan.audits.length}}}});
      assert.equal(await tx.supportTicket.count({where:{id:{startsWith:BATCH+'_'}}}),24);assert.equal(await tx.workflowCase.count({where:{id:{startsWith:BATCH+'_'}}}),10);
    },{timeout:60000});
    const after=await Promise.all([db.booking.count(),db.customerNotification.count(),db.riderServiceApproval.count(),db.riderApplicationEmail.count()]);
    // Global counts can rise from unrelated live traffic; the script has no write calls for these tables.
    assert(after.every((count,index)=>count>=baseline[index]));
    console.log(JSON.stringify({applied:true,batch:BATCH,...counts,credentialsFile}));
  }finally{await db.$disconnect();}
}
if(require.main===module)main().catch(error=>{console.error('Team setup failed:',error.code||error.message);process.exitCode=1;});
module.exports={BATCH,NEW_STAFF,buildActivity};
