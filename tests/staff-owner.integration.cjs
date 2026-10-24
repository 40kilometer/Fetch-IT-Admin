// Opt-in integration test. Migrations and fixtures live only in a random schema.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const {PrismaClient}=require('@prisma/client');
if(process.env.RUN_STAFF_OWNER_INTEGRATION!=='1')throw Error('Set RUN_STAFF_OWNER_INTEGRATION=1.');
const root=path.resolve(__dirname,'..');
const ownerRoot=path.resolve(process.env.OWNER_APP_PATH||path.join(root,'../fetch-superadmin'));
const customerRoot=path.resolve(root,'../fetch-customer');
if(!process.env.DATABASE_URL)process.loadEnvFile(path.join(root,'.env'));
const schema='fetch_roles_test_'+crypto.randomUUID().replaceAll('-','');
const url=new URL(process.env.DATABASE_URL);
url.searchParams.set('schema',schema);
url.searchParams.set('options',`${url.searchParams.get('options')||''} -c search_path=${schema},pg_catalog`.trim());
const db=new PrismaClient({datasourceUrl:url.toString()});
const staffOrigin='http://localhost:3322',ownerOrigin='http://localhost:3323';
const servers=[];
const password='Temporary-Role-Test-2026!';
const salt=crypto.randomBytes(16).toString('hex');
const passwordHash=salt+':'+crypto.scryptSync(password,salt,64).toString('hex');
let ownsSchema=false;
let checks=0;
const b64=value=>Buffer.from(value).toString('base64url');
const sha=value=>crypto.createHash('sha256').update(value).digest();
function jar(){return new Map();}
async function request(origin,route,cookies,expected=200,method='GET',data,originOverride){
  const res=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(cookies?.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(method!=='GET'?{origin:originOverride??origin}:{})},...(data===undefined?{}:{body:JSON.stringify(data)}),redirect:'manual',signal:AbortSignal.timeout(90000)});
  for(const value of res.headers.getSetCookie()){const [pair]=value.split(';');const i=pair.indexOf('=');cookies?.set(pair.slice(0,i),pair.slice(i+1));}
  const body=await res.text();assert.equal(res.status,expected,`${route}: ${body.slice(0,300)}`);checks++;
  return res.headers.get('content-type')?.includes('application/json')?JSON.parse(body):body;
}
async function start(app,port){
  const proc=spawn(process.execPath,[path.join(app,'node_modules/next/dist/bin/next'),'dev','--webpack','-p',String(port)],{cwd:app,env:{...process.env,NODE_ENV:'development',DATABASE_URL:url.toString(),ADMIN_SESSION_SECRET:crypto.randomBytes(32).toString('hex'),SESSION_SECRET:crypto.randomBytes(32).toString('hex'),SUPERADMIN_URL:ownerOrigin,SUPERADMIN_RP_ID:'localhost',NEXT_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  servers.push(proc);let logs='';proc.stdout.on('data',s=>{logs=(logs+s).slice(-5000);});proc.stderr.on('data',s=>{logs=(logs+s).slice(-5000);});
  for(let i=0;i<100;i++){assert.equal(proc.exitCode,null,'Test server exited: '+logs);try{const res=await fetch(`http://localhost:${port}/login`,{signal:AbortSignal.timeout(2000)});if(res.status===200)return;}catch{}await new Promise(r=>setTimeout(r,300));}
  throw Error('Test server unavailable: '+logs);
}
async function createUser(role,suffix=''){
  const email=`${role.toLowerCase()}${suffix}@roles.example.invalid`;
  return db.user.create({data:{email,name:role+suffix,role,authIdentities:{create:{provider:'PASSWORD',providerUserId:email,passwordHash}},...(role==='RIDER'?{riderProfile:{create:{vehicleClass:'TRICYCLE'}},riderPresence:{create:{isOnline:true}}}:{})}});
}
async function login(user){const cookies=jar();await request(staffOrigin,'/api/auth/login',cookies,200,'POST',{email:user.email,password});return cookies;}
async function registerOwner(owner,token,cookies){
  const {encodeCBOR}=require(path.join(ownerRoot,'node_modules/@levischuck/tiny-cbor'));
  const keys=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const jwk=keys.publicKey.export({format:'jwk'}),credentialId=crypto.randomBytes(32);
  const options=await request(ownerOrigin,'/api/owner-auth',cookies,200,'POST',{action:'enroll-options',token});
  const cose=encodeCBOR(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]));
  const length=Buffer.alloc(2);length.writeUInt16BE(credentialId.length);
  const authData=Buffer.concat([sha('localhost'),Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),length,credentialId,Buffer.from(cose)]);
  const attestation=encodeCBOR(new Map([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(authData)]]));
  const response={id:b64(credentialId),rawId:b64(credentialId),type:'public-key',clientExtensionResults:{credProps:{rk:true}},response:{clientDataJSON:b64(JSON.stringify({type:'webauthn.create',challenge:options.options.challenge,origin:ownerOrigin})),attestationObject:b64(attestation),transports:['internal']}};
  await request(ownerOrigin,'/api/owner-auth',cookies,200,'POST',{action:'enroll-verify',label:'Disposable test passkey',response});
  return {keys,credentialId,counter:0,owner};
}
async function authenticate(credential,cookies,{uv=true,origin=ownerOrigin,expected=200}={}){
  const options=await request(ownerOrigin,'/api/owner-auth',cookies,200,'POST',{action:'options'});
  const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:options.options.challenge,origin}));
  const counter=Buffer.alloc(4);counter.writeUInt32BE(++credential.counter);
  const authData=Buffer.concat([sha('localhost'),Buffer.from([uv?5:1]),counter]);
  const response={id:b64(credential.credentialId),rawId:b64(credential.credentialId),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(client),authenticatorData:b64(authData),signature:b64(crypto.sign('sha256',Buffer.concat([authData,sha(client)]),credential.keys.privateKey)),userHandle:b64(credential.owner.id)}};
  await request(ownerOrigin,'/api/owner-auth',cookies,expected,'POST',{action:'verify',response});return response;
}
(async()=>{
  try{
    assert.equal((await db.$queryRaw`SELECT nspname FROM pg_namespace WHERE nspname=${schema}`).length,0);
    ownsSchema=true;
    const migration=spawnSync(process.execPath,[path.join(customerRoot,'node_modules/prisma/build/index.js'),'migrate','deploy'],{cwd:customerRoot,env:{...process.env,DATABASE_URL:url.toString()},windowsHide:true,encoding:'utf8',timeout:120000});
    assert.equal(migration.status,0,'Disposable migration failed: '+migration.stderr);
    const functions=await db.$queryRaw`SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=${schema}`;
    for(const fn of functions){assert(/^fetch_[a-z_]+$/.test(fn.name));await db.$executeRawUnsafe(`ALTER FUNCTION "${schema}"."${fn.name}"() SET search_path TO "${schema}",pg_catalog`);}
    const [admin,admin2,support,support2,supervisor,finance,safety,customer,rider]=await Promise.all(['ADMIN','ADMIN','SUPPORT','SUPPORT','SUPPORT_SUPERVISOR','FINANCE','SAFETY','CUSTOMER','RIDER'].map((role,i)=>createUser(role,String(i))));
    const ownerActor=await db.user.create({data:{email:'owner@roles.example.invalid',name:'Test Owner',role:'SUPERADMIN'}});
    const owner=await db.ownerIdentity.create({data:{actorId:ownerActor.id,email:ownerActor.email,name:ownerActor.name}});
    const enrollment=crypto.randomBytes(32).toString('base64url');await db.ownerInvitation.create({data:{id:sha(enrollment).toString('hex'),ownerId:owner.id,expiresAt:new Date(Date.now()+600000)}});
    const booking=await db.booking.create({data:{customerId:customer.id,type:'DELIVERY',status:'PENDING',refCode:'ROLE-TEST-BOOKING',pickupLabel:'Test pickup',pickupLat:16.03,pickupLng:120.23,dropoffLabel:'Test destination',dropoffLat:16.04,dropoffLng:120.24,vehicleClass:'TRICYCLE',distanceKm:2,baseFare:50,surgeMultiplier:1,totalFare:62}});
    const ticket=await db.supportTicket.create({data:{customerId:customer.id,bookingId:booking.id,category:'BOOKING',message:'Temporary support question'}});
    const privateTicket=await db.supportTicket.create({data:{customerId:customer.id,category:'OTHER',message:'Other agent private ticket',assignedAdminId:support2.id}});
    await start(root,3322);await start(ownerRoot,3323);
    const adminJar=await login(admin),admin2Jar=await login(admin2),supportJar=await login(support),supervisorJar=await login(supervisor),financeJar=await login(finance),safetyJar=await login(safety);
    await request(staffOrigin,'/api/auth/login',jar(),401,'POST',{email:owner.email,password});
    await request(staffOrigin,'/api/bookings/export',supportJar,401);
    await request(staffOrigin,'/dashboard/bookings',supportJar,307);
    await request(staffOrigin,'/dashboard/support/'+privateTicket.id,supportJar,404);
    await request(staffOrigin,'/api/support/'+ticket.id,supportJar,200,'PATCH',{status:'IN_PROGRESS',reply:'Test support response',assignedAdminId:support.id,updatedAt:ticket.updatedAt.toISOString()});
    await request(staffOrigin,'/api/support/'+ticket.id+'/notes',supportJar,200,'POST',{note:'Internal-only evidence'});
    assert.equal(await db.supportMessage.count({where:{ticketId:ticket.id,body:'Internal-only evidence'}}),0);
    assert.equal(await db.supportInternalNote.count({where:{ticketId:ticket.id}}),1);
    await request(staffOrigin,'/api/support/'+ticket.id,financeJar,401,'PATCH',{status:'IN_PROGRESS',reply:''});
    await request(staffOrigin,'/api/cases',supportJar,403,'POST',{kind:'ESCALATION',title:'Unlinked lookup',summary:'Should be denied',bookingRef:booking.refCode});
    await request(staffOrigin,'/api/cases',supportJar,201,'POST',{kind:'SAFETY',title:'Escalated concern',summary:'Review assigned ticket',ticketId:ticket.id});
    assert.equal((await request(staffOrigin,'/api/cases',supportJar)).cases.length,0);
    const safetyCases=(await request(staffOrigin,'/api/cases',safetyJar)).cases;assert.equal(safetyCases.length,1);
    assert.equal((await request(staffOrigin,'/api/cases',financeJar)).cases.length,0);
    await request(staffOrigin,'/dashboard/team',supervisorJar);
    await request(staffOrigin,'/api/cases/'+safetyCases[0].id,financeJar,404,'PATCH',{action:'claim',version:1});
    await request(staffOrigin,'/api/cases/'+safetyCases[0].id,safetyJar,200,'PATCH',{action:'claim',version:1});
    await request(staffOrigin,'/api/cases/'+safetyCases[0].id,safetyJar,200,'PATCH',{action:'recommend',version:2,recommendation:'Review rider restriction'});
    await request(staffOrigin,'/api/cases/'+safetyCases[0].id,adminJar,200,'PATCH',{action:'decide',version:3,outcome:'APPROVED',reason:'Reviewed separate evidence'});
    const self=await request(staffOrigin,'/api/cases',adminJar,201,'POST',{kind:'FINANCE',title:'Self approval test',summary:'Separate reviewer required'});
    const selfId=self.redirect.split('/').at(-1);
    await request(staffOrigin,'/api/cases/'+selfId,adminJar,200,'PATCH',{action:'recommend',version:1,recommendation:'Investigate cash discrepancy'});
    await request(staffOrigin,'/api/cases/'+selfId,adminJar,403,'PATCH',{action:'decide',version:2,outcome:'APPROVED',reason:'Self approval denied'});
    await request(staffOrigin,'/api/cases/'+selfId,admin2Jar,200,'PATCH',{action:'decide',version:2,outcome:'APPROVED',reason:'Independent review'});
    await request(staffOrigin,'/api/cases',supportJar,403,'POST',{kind:'ESCALATION',title:'CSRF',summary:'Denied'},'https://foreign.example');
    const ownerJar=jar();const credential=await registerOwner(owner,enrollment,ownerJar);
    await request(ownerOrigin,'/api/owner-auth',jar(),403,'POST',{action:'enroll-options',token:enrollment});
    await request(ownerOrigin,'/api/settings',adminJar,401,'POST',{version:0,settings:{},reason:'Denied'});
    await request(staffOrigin,'/api/cases',ownerJar,401);
    await request(ownerOrigin,'/api/owners',ownerJar,409,'POST',{action:'disable',id:owner.id});
    await request(ownerOrigin,'/api/owners',ownerJar,409,'POST',{action:'remove-key',keyId:b64(credential.credentialId)});
    await request(ownerOrigin,'/api/staff',ownerJar,200,'POST',{action:'role',id:support.id,role:'FINANCE',reason:'Temporary test role change'});
    await request(staffOrigin,'/api/cases',supportJar,401);
    assert.equal((await db.user.findUnique({where:{id:support.id}})).role,'FINANCE');
    await assert.rejects(()=>db.user.update({where:{id:customer.id},data:{role:'SUPERADMIN'}}));checks++;
    // Settings payload is read from the server-rendered editor's existing config via
    // an isolated fixture generated by the canonical policy unit-test helper below.
    const ts=require(path.join(root,'node_modules/typescript'));
    const fs=require('node:fs');const Module=require('node:module');
    function loadTS(file){const filename=path.join(customerRoot,file);const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));const original=mod.require.bind(mod);mod.require=name=>name==='./pricing-defaults'?loadTS('src/lib/pricing-defaults.ts'):original(name);mod._compile(compiled,filename);return mod.exports;}
    const settings=loadTS('src/lib/platform-policy.ts').defaultPlatformSettings();settings.commissionPercent=20;settings.fares.TRICYCLE.baseFare+=10;
    await request(ownerOrigin,'/api/settings',ownerJar,200,'POST',{version:0,settings,reason:'Verify versioned platform settings'});
    await request(ownerOrigin,'/api/settings',ownerJar,409,'POST',{version:0,settings,reason:'Stale save denied'});
    assert.equal((await db.booking.findUnique({where:{id:booking.id}})).totalFare.toString(),'62');
    const sessionId=sha(ownerJar.get('fetch_owner')).toString('hex');await db.ownerSession.update({where:{id:sessionId},data:{verifiedAt:new Date(Date.now()-6*60000)}});
    await request(ownerOrigin,'/api/settings',ownerJar,401,'POST',{version:1,settings,reason:'Stale authentication denied'});
    await authenticate(credential,jar(),{uv:false,expected:400});
    await authenticate(credential,jar(),{origin:'https://wrong.example',expected:400});
    const response=await authenticate(credential,ownerJar);
    assert.equal(await db.ownerSession.count({where:{ownerId:owner.id}}),1,'Reauthentication must reuse the existing session');
    await request(ownerOrigin,'/api/owner-auth',ownerJar,401,'POST',{action:'verify',response});
    await request(ownerOrigin,'/api/settings',ownerJar,200,'POST',{version:1,settings,reason:'Fresh authentication accepted'});
    await request(ownerOrigin,'/dashboard/settings',ownerJar);
    await request(ownerOrigin,'/api/owners',ownerJar,200,'POST',{action:'revoke-session',id:sessionId});
    await request(ownerOrigin,'/api/settings',ownerJar,401,'POST',{version:2,settings,reason:'Revoked session denied'});
    assert(await db.ownerAudit.count()>5);
    console.log(`PASS: ${checks} HTTP/security assertions; staff scopes, support notes, review separation, passkey enrollment/verification, replay/origin/UV checks, owner-session freshness/revocation, role changes, immutable booking prices, settings versions and audits.`);
  }finally{
    for(const server of servers)server.kill();
    for(const server of servers)await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(resolve,5000);});
    if(ownsSchema){assert(/^fetch_roles_test_[a-f0-9]{32}$/.test(schema));await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}
    await db.$disconnect();
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
