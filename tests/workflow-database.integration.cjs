// Opt-in: real Postgres transactions in a fresh random schema. No public-table
// writes, outbound email, push transport, private uploads or real credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),ts=require('typescript'),{PrismaClient}=require('@prisma/client'),{NextRequest}=require('next/server');
assert.equal(process.env.RUN_WORKFLOW_DATABASE_TEST,'1');assert(process.env.DATABASE_URL);
const schema='fetch_workflow_test_'+crypto.randomUUID().replaceAll('-',''),url=new URL(process.env.DATABASE_URL);
url.searchParams.set('schema',schema);url.searchParams.set('options',`-c search_path=${schema},pg_catalog`);
assert(/^fetch_workflow_test_[a-f0-9]{32}$/.test(schema));assert.equal(url.searchParams.get('schema'),schema);
const db=new PrismaClient({datasourceUrl:url.toString()}),admin={id:'admin',name:'Test Admin',role:'ADMIN'},safety={id:'safety',name:'Test Safety',role:'SAFETY'},cs={id:'cs',name:'Test Support',role:'SUPPORT'};
let actor=cs,owned=false,checks=0;
function load(file,cache=new Map()){
 const full=path.resolve(file);if(cache.has(full))return cache.get(full);const exports={};cache.set(full,exports);
 new Function('exports','require',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(exports,name=>{
  if(name==='./db'||name==='@/lib/db')return {db};
  if(name==='@/lib/staff-access'||name==='./staff-access')return {currentStaff:async permission=>!permission||requirePolicy().hasPermission(actor.role,permission)?actor:null};
  if(name==='./application-mail'||name==='./application-storage')return {};
  if(name==='@/lib/request-guard')return {withRequestLog:(_,handler)=>handler};
  if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?'src/'+name.slice(2):path.resolve(path.dirname(full),name);return load(base+'.ts',cache)}return require(name);
 });return exports;
}
let policy;function requirePolicy(){return policy??=load('src/lib/staff-policy.ts')}
async function check(label,fn){await fn();checks++;console.log(JSON.stringify({check:label,result:'PASS'}))}
const request=(body)=>new NextRequest('https://workflow.example.invalid/api/cases',{method:'PATCH',headers:{origin:'https://workflow.example.invalid','content-type':'application/json'},body:JSON.stringify(body)});
async function main(){try{
 assert.equal((await db.$queryRaw`SELECT nspname FROM pg_namespace WHERE nspname=${schema}`).length,0);
 // Prisma creates all tables/types in the URL's random schema, not public.
 owned=true;
 const migration=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','push','--skip-generate','--schema',path.resolve('prisma/schema.prisma')],{env:{...process.env,DATABASE_URL:url.toString()},encoding:'utf8',windowsHide:true,timeout:120000});
 assert.equal(migration.status,0,'Disposable schema setup failed.');
 assert.equal((await db.$queryRaw`SELECT current_schema() AS schema`)[0].schema,schema);
 await db.user.createMany({data:[admin,safety,cs,{id:'rider',name:'Test Rider',role:'RIDER'},{id:'customer',name:'Test Customer',role:'CUSTOMER'}].map(u=>({...u,email:u.id+'@workflow.fetchit.invalid'}))});
 await db.riderProfile.create({data:{userId:'rider',vehicleClass:'MOTORCYCLE'}});
 const rule=load('src/lib/rider-application-policy.ts'),service=load('src/lib/rider-application.ts');
 const fields={legalName:'Test Rider',birthDate:'1990-01-01',address:'Test address',mobile:'09123456789',emergencyName:'Test contact',emergencyRelationship:'Sibling',emergencyPhone:'09987654321',licenceNumber:'TEST-ONLY',licenceCodes:'A',licenceExpiry:'2099-01-01',nbiExpiry:'2099-01-01',vehicleMake:'Test',vehicleModel:'Test',vehicleYear:'2025',plateNumber:'TEST-ONLY',registrationExpiry:'2099-01-01',capacity:'10',displacement:'125',ownership:'OWNER',operatingArea:'Lingayen'};
 await db.riderApplication.create({data:{id:'app',userId:'rider',status:'SUBMITTED',vehicleClass:'MOTORCYCLE',services:['DELIVERY'],fields,emailVerifiedAt:new Date(),verifiedEmail:'rider@workflow.fetchit.invalid',documents:{create:rule.requiredDocuments('MOTORCYCLE',['DELIVERY'],fields).map(kind=>({kind,version:1,pathname:'not-an-upload/'+kind,mimeType:'application/pdf'}))}}});
 const app=()=>db.riderApplication.findUniqueOrThrow({where:{id:'app'}});
 const review=async(action,body={},person=safety)=>service.reviewApplication('app',person,{action,version:(await app()).version,...body});
 await check('unclaimed reviewer cannot change an application',async()=>{await assert.rejects(review('review',{section:'personal',status:'ACCEPTED'}),/Claim/);assert.equal(await db.adminAudit.count(),0)});
 await review('claim');
 for(const section of Object.keys(rule.SECTION_FIELDS))await review('review',{section,status:'ACCEPTED'});
 for(const doc of await db.riderApplicationDocument.findMany())await review('review',{documentId:doc.id,status:'ACCEPTED'});
 await check('concurrent double submission commits exactly once',async()=>{
  const version=(await app()).version,before=await db.adminAudit.count();const results=await Promise.allSettled([review('review',{section:'personal',status:'ACCEPTED',version}),review('review',{section:'personal',status:'ACCEPTED',version})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected')[0].reason.status,409);assert.equal(await db.adminAudit.count(),before+1);
 });
 await check('orientation and assessment gates persist in Postgres',async()=>{
  await review('schedule',{orientationAt:new Date(Date.now()+86400000).toISOString(),venue:'Test location',instructions:'Test instructions'});
  await assert.rejects(review('assessment',{attended:true,passed:true,notes:'Assessment passed'}));
  assert.equal(await db.riderServiceApproval.count(),0);
  await db.riderApplication.update({where:{id:'app'},data:{orientationAt:new Date(Date.now()-60000)}});
  await review('assessment',{attended:true,passed:true,notes:'Passed the test assessment'});await review('activate',{services:['DELIVERY']});
  assert.equal((await app()).status,'ACTIVE');assert.equal((await db.riderServiceApproval.findFirst()).approvedById,safety.id);
 });
 await check('rejection, Safety exception and Admin approval remain distinct',async()=>{
  await review('reopen',{reason:'Restart disposable test'},admin);await db.riderApplication.update({where:{id:'app'},data:{status:'SUBMITTED'}});await review('claim');
  for(const section of Object.keys(rule.SECTION_FIELDS))await review('review',{section,status:'ACCEPTED'});
  for(const doc of await db.riderApplicationDocument.findMany())await review('review',{documentId:doc.id,status:'ACCEPTED'});
  await review('schedule',{orientationAt:new Date(Date.now()+86400000).toISOString(),venue:'Test venue',instructions:'Test instructions'});await db.riderApplication.update({where:{id:'app'},data:{orientationAt:new Date(Date.now()-60000)}});
  await review('assessment',{attended:false,passed:false,notes:'Did not attend test orientation'});await review('reject',{reason:'Missed test orientation'});assert.equal((await app()).status,'REJECTED');
  const pending=await review('force-approval',{reason:'Test management exception',services:['DELIVERY']});assert.equal(pending.status,'FORCE_APPROVAL_PENDING');assert.equal(await db.riderServiceApproval.count({where:{revokedAt:null}}),0);
  const event=await db.riderApplicationEvent.findFirst({where:{action:'FORCE_APPROVAL_REQUESTED'},orderBy:{createdAt:'desc'}});
  await assert.rejects(review('approve-force',{requestId:event.details.requestId}),/Admin/);await review('approve-force',{requestId:event.details.requestId},admin);
  assert.equal((await app()).status,'ACTIVE');assert.equal((await db.riderServiceApproval.findFirst()).approvedById,admin.id);
 });
 await db.supportTicket.create({data:{id:'ticket',customerId:'customer',category:'OTHER',message:'Test issue'}});
 const support=load('src/app/api/support/[id]/route.ts').PATCH;
 await check('claim, public reply, duplicate rejection and resolution persist together',async()=>{
  actor=cs;const patch=async(reply,status,updatedAt)=>(support(request({status,reply,assignedAdminId:cs.id,updatedAt}),{params:Promise.resolve({id:'ticket'})}));
  let ticket=await db.supportTicket.findUniqueOrThrow({where:{id:'ticket'}});assert.equal((await patch('','OPEN',ticket.updatedAt.toISOString())).status,200);
  ticket=await db.supportTicket.findUniqueOrThrow({where:{id:'ticket'}});const stale=ticket.updatedAt.toISOString();assert.equal((await patch('Customer reply','IN_PROGRESS',stale)).status,200);assert.equal((await patch('Duplicate reply','IN_PROGRESS',stale)).status,409);
  assert.equal(await db.supportMessage.count(),1);assert.equal(await db.customerNotification.count(),1);
  ticket=await db.supportTicket.findUniqueOrThrow({where:{id:'ticket'}});assert.equal((await patch('Resolution sent','RESOLVED',ticket.updatedAt.toISOString())).status,200);
 });
 const post=load('src/app/api/cases/route.ts').POST,patchCase=load('src/app/api/cases/[id]/route.ts').PATCH;
 // A separate open conversation is used for the handoff path.
 await db.supportTicket.create({data:{id:'handoff',customerId:'customer',category:'OTHER',message:'Test handoff',assignedAdminId:cs.id}});
 await check('CS handoff, Safety findings, independent Admin decision, resolution and audit reasons',async()=>{
  actor=cs;const body={kind:'SAFETY',ticketId:'handoff',title:'Disposable Safety review',priority:'HIGH',helpReason:'Needs a safety investigation',tried:'Collected the reported details'};
  const response=await post(new NextRequest('https://workflow.example.invalid/api/cases',{method:'POST',headers:{origin:'https://workflow.example.invalid','content-type':'application/json'},body:JSON.stringify(body)}));assert.equal(response.status,201);const id=(await response.json()).id;
  const update=async data=>patchCase(request({version:(await db.workflowCase.findUniqueOrThrow({where:{id}})).version,...data}),{params:Promise.resolve({id})});
  assert.equal((await update({action:'claim'})).status,403);actor=safety;assert.equal((await update({action:'claim'})).status,200);assert.equal((await update({action:'recommend',recommendation:'Preserve evidence and follow up'})).status,200);
  assert.equal((await update({action:'decide',outcome:'APPROVED',reason:'Cannot self approve'})).status,403);actor=admin;
  assert.equal((await update({action:'decide',outcome:'APPROVED',reason:'Evidence supports the proposed follow-up'})).status,200);actor=safety;assert.equal((await update({action:'close',reason:'Follow-up completed and recorded'})).status,200);
  const audit=await db.adminAudit.findFirst({where:{entityId:id,action:'CASE_DECIDE'}});assert.equal(audit.actorId,admin.id);assert.equal(audit.details.reason,'Evidence supports the proposed follow-up');
  assert.equal((await db.adminAudit.findFirst({where:{entityId:id,action:'CASE_CLOSE'}})).details.reason,'Follow-up completed and recorded');assert.equal((await update({action:'note',note:'Too late'})).status,409);
 });
 assert.equal(await db.authIdentity.count(),0);assert.equal(await db.staffSession.count(),0);
 console.log(JSON.stringify({databaseWorkflowChecks:checks,outboundDelivery:false,liveDataWrites:false}));
}finally{
 if(owned){assert(/^fetch_workflow_test_[a-f0-9]{32}$/.test(schema));await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);console.log(JSON.stringify({disposableSchemaRemoved:true}))}await db.$disconnect();
}}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1});
