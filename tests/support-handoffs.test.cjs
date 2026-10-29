const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {NextRequest} = require('next/server');
const root = path.resolve(__dirname,'..');
const plain = value => JSON.parse(JSON.stringify(value));
function load(file, overrides=new Map(), cache=new Map()) {
  let filename=path.resolve(root,file);
  if(!fs.existsSync(filename)&&fs.existsSync(filename+'x'))filename+='x';
  if(overrides.has(filename))return overrides.get(filename);
  if(cache.has(filename))return cache.get(filename);
  const exports={};cache.set(filename,exports);
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,process,Buffer,URL,URLSearchParams,setTimeout,clearTimeout,console,require(name){
    if(overrides.has(name))return overrides.get(name);
    if(name.startsWith('@/'))return load(name.replace('@/','src/')+'.ts',overrides,cache);
    if(name.startsWith('.'))return load(path.resolve(path.dirname(filename),name+'.ts'),overrides,cache);
    return require(name);
  }},{filename});return exports;
}
const policy=load('src/lib/staff-policy.ts'), queue=load('src/lib/review-queue.ts');
function matches(row,where={}) {
  return Object.entries(where).every(([key,value])=>key==='AND'?value.every(w=>matches(row,w)):key==='OR'?value.some(w=>matches(row,w)):value&&typeof value==='object'?('in'in value?value.in.includes(row[key]):'not'in value?row[key]!==value.not:matches(row[key]??{},value)):row[key]===value);
}
function fixture(role='SUPPORT') {
  const actor={id:'staff',name:'Test staff',role,email:'test@example.invalid'};
  const ticket={id:'ticket',assignedAdminId:'staff',customerId:'customer',bookingId:'booking',status:'OPEN',priority:'HIGH',message:'Customer message',createdAt:new Date(),updatedAt:new Date(),customer:{name:'Test customer'}};
  const cases=[],notes=[],audits=[],queries=[];
  const db={
    async $queryRaw(){return [];}, async $transaction(fn){return fn(db);},
    supportTicket:{async findFirst({where}){return matches(ticket,where)?{...ticket}:null;},async findUnique(){return {...ticket};}},
    supportMessage:{async count(){return 1;},async findMany(){return [{id:'message',authorName:'Customer',authorRole:'CUSTOMER',body:'Linked public conversation',createdAt:new Date()}];}},
    workflowCase:{async findFirst({where}){return cases.find(c=>matches(c,where))??null;},async create({data}){const record={id:'case',version:1,createdAt:new Date(),updatedAt:new Date(),assignedToId:null,...data};cases.push(record);return record;},async update({where,data}){const record=cases.find(c=>c.id===where.id);Object.assign(record,{...data,version:record.version+1});return {...record};},async count({where}){queries.push(where);return cases.filter(c=>matches(c,where)).length;},async findMany(input){queries.push(input);return cases.filter(c=>matches(c,input.where));}},
    workflowNote:{async create({data}){notes.push({id:'note',createdAt:new Date(),...data});return notes.at(-1);},async count({where}){return notes.filter(n=>matches(n,where)).length;},async findMany({where}){queries.push(where);return notes.filter(n=>matches(n,where));}},
    user:{async findFirst({where}){return matches({id:'reviewer',role:'SUPPORT',isBanned:false},where)?{id:'reviewer',role:'SUPPORT'}:null;},async findMany(){return [];},async findUnique(){return {name:'Reviewer'};}},
    booking:{async findUnique(){return {id:'booking',customerId:'customer',refCode:'FIT-TEST',type:'DELIVERY',status:'PENDING',totalFare:100,paymentMethod:'CASH',paymentStatus:'PENDING',pickupLabel:'Pickup',dropoffLabel:'Dropoff'};}},
    adminAudit:{async create({data}){audits.push(data);return data;}},
  };
  const overrides=new Map([
    [path.join(root,'src/lib/db.ts'),{db}],
    [path.join(root,'src/lib/staff-access.ts'),{currentStaff:async()=>actor,requireStaffPage:async()=>actor}],
    [path.join(root,'src/lib/owner-auth.ts'),{currentOwner:async()=>actor}],
    ['next/navigation',{notFound(){throw new Error('NOT_FOUND');},useRouter:()=>({replace(){},refresh(){}}),usePathname:()=>'/dashboard/cases',useSearchParams:()=>new URLSearchParams()}],
    ['next/link',{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)}],
  ]);
  const body={kind:'ESCALATION',ticketId:'ticket',title:'Need help',helpReason:'A repeated unresolved complaint.',tried:'Checked the booking and contacted the rider.',priority:'HIGH'};
  return {actor,ticket,cases,notes,audits,queries,overrides,body,
    async create(change={},origin='https://test.invalid'){const route=load('src/app/api/cases/route.ts',overrides);return route.POST(new NextRequest('https://test.invalid/api/cases',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({...body,...change})}));},
    async patch(change={}){const route=load('src/app/api/cases/[id]/route.ts',overrides);return route.PATCH(new NextRequest('https://test.invalid/api/cases/case',{method:'PATCH',headers:{origin:'https://test.invalid','content-type':'application/json'},body:JSON.stringify({version:1,reason:'Test intervention',...change})}),{params:Promise.resolve({id:'case'})});},
  };
}
test('Finance is retired: no login role or permissions, but old accounts can be managed',()=>{
  assert.equal(policy.isStaffRole('FINANCE'),false);assert.equal(policy.isManagedStaffRole('FINANCE'),true);
  for(const permission of ['operations','support','finance','safety'])assert.equal(policy.hasPermission('FINANCE',permission),false);
  assert.equal(policy.hasPermission('ADMIN','finance'),true);assert.equal(policy.hasPermission('SUPERADMIN','finance'),true);
});
test('CS scope contains only their own handoffs, including Safety; no unassigned case pool',()=>{
  const scope=plain(policy.caseScope({role:'SUPPORT',id:'staff'}));
  assert.equal(matches({createdById:'other',assignedToId:null,kind:'ESCALATION'},scope),false);
  assert.equal(matches({createdById:'staff',kind:'SAFETY'},scope),true);
});
test('Only supervisor/Admin can review escalations; Safety cannot claim them',()=>{
  for(const role of ['SUPPORT','SAFETY','FINANCE'])assert.equal(policy.canReviewCase(role,'ESCALATION'),false);
  for(const role of ['SUPPORT_SUPERVISOR','ADMIN','SUPERADMIN'])assert.equal(policy.canReviewCase(role,'ESCALATION'),true);
  assert.equal(policy.canReviewCase('SAFETY','SAFETY'),true);
  assert.equal(policy.canReviewCase('SUPPORT_SUPERVISOR','SAFETY'),false);
  assert.equal(policy.caseReviewerRoles('ESCALATION').includes('SUPPORT'),false);
});
for(const kind of ['ESCALATION','SAFETY'])test(`CS sends ${kind} handoff with linked records and both internal answers`,async()=>{
  const f=fixture();const response=await f.create({kind});assert.equal(response.status,201);
  const record=f.cases[0];assert.equal(record.status,'OPEN');assert.equal(record.priority,'HIGH');assert.equal(record.ticketId,'ticket');assert.equal(record.bookingId,'booking');assert.equal(record.createdById,'staff');
  assert.match(record.summary,/A repeated unresolved complaint/);assert.match(record.summary,/What have you already tried/);assert.match(record.summary,/contacted the rider/);
  assert.equal(f.ticket.status,'OPEN');assert.equal(f.notes.length,0);assert.equal(f.audits[0].action,'CASE_CREATED');
});
for(const [label,change] of [['missing priority',{priority:undefined}],['invalid priority',{priority:'AUTO'}],['missing reason',{helpReason:' '}],['missing attempts',{tried:' '}],['oversize reason',{helpReason:'x'.repeat(1801)}]])test(`Reject ${label} without a case or audit`,async()=>{
  const f=fixture();assert.equal((await f.create(change)).status,400);assert.equal(f.cases.length,0);assert.equal(f.audits.length,0);
});
test('CS must claim the original customer request before sending',async()=>{
  const f=fixture();f.ticket.assignedAdminId=null;assert.equal((await f.create()).status,403);assert.equal(f.cases.length,0);
});
test('CS cannot create a detached case or route to removed Finance',async()=>{
  for(const change of [{ticketId:undefined},{kind:'FINANCE'}]){const f=fixture();assert.equal((await f.create(change)).status,403);assert.equal(f.cases.length,0);}
});
test('Foreign origins cannot create a handoff',async()=>{const f=fixture();assert.equal((await f.create({},'https://foreign.invalid')).status,403);assert.equal(f.cases.length,0);});
test('Duplicate active handoffs are rejected; supervisor and Safety remain separate destinations',async()=>{
  const f=fixture();assert.equal((await f.create()).status,201);assert.equal((await f.create()).status,409);assert.equal((await f.create({kind:'SAFETY'})).status,201);assert.equal(f.cases.length,2);
});
for(const action of ['claim','assign','recommend','decide','close'])test(`CS cannot ${action} the receiving team's case through the API`,async()=>{
  const f=fixture();await f.create();assert.equal((await f.patch({action,assignedToId:'reviewer',recommendation:'text',outcome:'APPROVED'})).status,403);assert.equal(f.cases[0].status,'OPEN');
});
test('CS can append supporting information to their own handoff',async()=>{const f=fixture();await f.create();assert.equal((await f.patch({action:'note',note:'Additional reported facts'})).status,200);assert.equal(f.notes[0].authorId,'staff');});
test('A resolved handoff is read-only',async()=>{const f=fixture();await f.create();f.cases[0].status='RESOLVED';assert.equal((await f.patch({action:'note',note:'More'})).status,409);assert.equal(f.notes.length,0);});
test('Supervisor starts an unassigned escalation; it becomes In review',async()=>{const f=fixture('SUPPORT_SUPERVISOR');await f.create();assert.equal((await f.patch({action:'claim'})).status,200);assert.equal(f.cases[0].status,'IN_REVIEW');});
test('A supervisor cannot assign a normal CS agent as escalation reviewer',async()=>{const f=fixture('SUPPORT_SUPERVISOR');await f.create();assert.equal((await f.patch({action:'assign',assignedToId:'reviewer'})).status,400);});
test('Safety can start Safety cases but cannot read another team case',async()=>{
  const f=fixture();await f.create({kind:'SAFETY'});f.actor.role='SAFETY';assert.equal((await f.patch({action:'claim'})).status,200);
  f.cases[0].kind='ESCALATION';assert.equal((await f.patch({action:'claim',version:2})).status,404);
});
test('Internal approval stages remain In review without losing the Admin gate',()=>{
  assert.deepEqual(plain(queue.REVIEW_STATUSES),['OPEN','IN_REVIEW','RESOLVED']);
  for(const status of ['AWAITING_ADMIN','APPROVED','REJECTED'])assert.equal(queue.reviewStatus(status),'IN_REVIEW');
  assert.deepEqual(plain(queue.reviewStatusWhere('IN_REVIEW')),{in:['IN_REVIEW','AWAITING_ADMIN','APPROVED','REJECTED']});
  assert.equal(queue.readQueue({status:'invalid',sort:'priority',priority:'HIGH'},false).status,'OPEN');
  assert.equal(queue.readQueue({sort:'priority',priority:'HIGH'},false).sort,'oldest');
  assert.equal(queue.readQueue({priority:'HIGH'},false).priority,'');
});
for(const role of ['SUPPORT','SUPPORT_SUPERVISOR','SAFETY','ADMIN'])test(`${role} queue renders only its intended filters`,async()=>{
  const f=fixture(role), module=load('src/components/review-pages.tsx',f.overrides);
  const html=renderToStaticMarkup(await module.CasesPage({searchParams:Promise.resolve({team:'finance',kind:'FINANCE',sort:'priority'})}));
  assert.doesNotMatch(html,/name="team"|name="kind".*All accessible|Queue default|Apply filters|Highest priority/);
  assert.equal(html.includes('name="priority"'),role!=='SUPPORT');
  assert.match(html,/Oldest first/);assert.match(html,/Newest first/);
  if(role==='SUPPORT')assert.match(html,/My escalated requests/);
});
test('CS tracking hides private findings and receiver notes; reviewer sees the handoff and conversation',async()=>{
  const f=fixture();await f.create({kind:'SAFETY'});Object.assign(f.cases[0],{recommendation:'PRIVATE FINDINGS',decision:'PRIVATE DECISION'});
  f.notes.push({id:'private',caseId:'case',authorId:'safety',authorName:'Safety',body:'PRIVATE EVIDENCE',createdAt:new Date()});
  const module=load('src/components/case-detail.tsx',f.overrides);
  const args={params:Promise.resolve({id:'case'}),searchParams:Promise.resolve({})};
  let html=renderToStaticMarkup(await module.CaseDetail(args));
  assert.doesNotMatch(html,/PRIVATE FINDINGS|PRIVATE DECISION|PRIVATE EVIDENCE|Start review|Request Admin decision/);
  assert.match(html,/Add supporting information/);assert.match(html,/Linked public conversation/);
  f.actor.role='SAFETY';html=renderToStaticMarkup(await module.CaseDetail(args));
  assert.match(html,/PRIVATE FINDINGS/);assert.match(html,/PRIVATE EVIDENCE/);assert.match(html,/contacted the rider/);
});

test('Safety records a resolution only after an Admin-approved recommendation',async()=>{
  const f=fixture();await f.create({kind:'SAFETY'});f.actor.role='SAFETY';f.cases[0].assignedToId='staff';f.cases[0].status='IN_REVIEW';
  assert.equal((await f.patch({action:'close',reason:'Investigation complete'})).status,409);
  f.cases[0].status='APPROVED';assert.equal((await f.patch({action:'close',reason:'Approved action recorded'})).status,200);assert.equal(f.cases[0].status,'RESOLVED');
});
