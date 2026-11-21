const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,mocks={},cache=new Map()){
 const full=path.resolve(file);if(cache.has(full))return cache.get(full);const exports={};cache.set(full,exports);
 new Function('exports','require',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(exports,name=>{
  if(name in mocks)return mocks[name];
  if(name==='next/link')return {__esModule:true,default:({href,children,...props})=>React.createElement('a',{href,...props},children)};
  if(name==='./queue-filters')return {QueueFilters:()=>null};if(name==='./action-form')return {ActionForm:()=>null};
  if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?'src/'+name.slice(2):path.resolve(path.dirname(full),name);return load(base+(fs.existsSync(base+'.tsx')?'.tsx':'.ts'),mocks,cache)}return require(name);
 });return exports;
}
const presentation=load('src/lib/workflow-presentation.ts');
test('decision readiness preserves independent approval and includes unassigned recommendations',()=>{
 for(const row of [{status:'AWAITING_ADMIN',assignedToId:null,createdById:'cs'},{status:'AWAITING_ADMIN',assignedToId:'safety',createdById:'cs'}])assert(presentation.canDecideCase(row,'admin'));
 for(const row of [{status:'AWAITING_ADMIN',assignedToId:'admin',createdById:'cs'},{status:'AWAITING_ADMIN',assignedToId:null,createdById:'admin'},{status:'APPROVED',assignedToId:'safety',createdById:'cs'}])assert(!presentation.canDecideCase(row,'admin'));
 const where=presentation.caseViewWhere('decisions','admin');assert.equal(where.createdById.not,'admin');assert.deepEqual(where.OR,[{assignedToId:null},{assignedToId:{not:'admin'}}]);
 assert.notEqual(presentation.caseNextAction({status:'AWAITING_ADMIN'}),presentation.caseNextAction({status:'IN_REVIEW'}));
});
test('notification grouping keeps one row per record and retains every read marker',()=>{
 const {groupNotifications}=load('src/lib/notification-groups.ts');
 const input=[{id:'old',title:'Old case',href:'/dashboard/cases/a',at:'2026-10-28',detail:'old'},{id:'new',title:'Awaiting Admin decision: Case A',href:'/dashboard/cases/a',at:'2026-10-30',detail:'new'},{id:'reply',title:'Customer replied',href:'/dashboard/support/t',at:'2026-10-29',detail:'reply'}];
 const groups=groupNotifications(input);assert.equal(groups[0].items.length,1);assert.deepEqual(groups[0].items[0].ids,['new','old']);assert.equal(groups[0].items[0].detail,'new');assert.equal(groups[1].items.length,1);assert.equal(groups[2].items.length,0);assert.equal(input.length,3);
});
test('awaiting-reply queue uses the dashboard predicate across open and in-progress requests and keeps it when paging',async()=>{
 const queries=[];const field={modelName:'SupportTicket',name:'lastAdminReplyAt'};
 const db={supportTicket:{fields:{lastAdminReplyAt:field},count:async({where})=>{queries.push(where);return 25},findMany:async({where})=>{queries.push(where);return []}}};
 const Page=load('src/components/review-pages.tsx',{'@/lib/db':{db},'@/lib/staff-access':{requireStaffPage:async()=>({id:'admin',role:'ADMIN'})}}).SupportPage;
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({unanswered:'1',q:'Alex'})}));
 assert.deepEqual(queries[0],queries[1]);assert.deepEqual(queries[0].AND[1].status.in,['OPEN','IN_PROGRESS']);assert.equal(queries[0].AND[1].OR[1].lastCustomerMessageAt.gt,field);assert.match(html,/Awaiting reply/);assert.match(html,/25 requests/);assert.match(html,/view=awaiting/);assert.match(html,/q=Alex/);
});
test('Admin decision queue retains permissions and exposes owner and next-action columns',async()=>{
 let where;const db={workflowCase:{count:async args=>{where=args.where;return 0},findMany:async()=>[]},user:{findMany:async()=>[]}};
 const Page=load('src/components/review-pages.tsx',{'@/lib/db':{db},'@/lib/staff-access':{requireStaffPage:async()=>({id:'admin',role:'ADMIN'})}}).CasesPage;
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({view:'decisions',team:'safety'})}));
 assert.equal(where.AND[1].status,'AWAITING_ADMIN');assert(where.AND.some(condition=>condition.kind==='SAFETY'));assert.match(html,/>Owner</);assert.match(html,/>Next action</);assert.match(html,/Needs my decision/);
});

test('task views retain staff scope and never widen an agent to other assigned conversations',async()=>{
 for(const role of ['ADMIN','SUPPORT','SUPPORT_SUPERVISOR'])for(const view of ['unassigned','mine','awaiting','escalated','resolved','all']){
  let where,caseWhere;const field={modelName:'SupportTicket',name:'lastAdminReplyAt'};
  const db={supportTicket:{fields:{lastAdminReplyAt:field},count:async args=>{where=args.where;return 21},findMany:async()=>[]},workflowCase:{findMany:async args=>{caseWhere=args.where;return [{ticketId:'linked-ticket'}]}}};
  const actor={id:'agent',role};const Page=load('src/components/review-pages.tsx',{'@/lib/db':{db},'@/lib/staff-access':{requireStaffPage:async()=>actor}}).SupportPage;
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({view,q:'Alex',page:'2'})}));
  const scope=load('src/lib/staff-policy.ts').supportScope(actor);assert.deepEqual(where.AND[0],scope);assert.match(html,new RegExp('view='+view));assert.match(html,/q=Alex/);
  if(view==='mine')assert.equal(where.AND[1].assignedAdminId,'agent');
  if(view==='unassigned')assert.equal(where.AND[1].assignedAdminId,null);
  if(view==='awaiting')assert.equal(where.AND[1].OR[1].lastCustomerMessageAt.gt,field);
  if(view==='escalated'){assert.deepEqual(caseWhere.AND[0],load('src/lib/staff-policy.ts').caseScope(actor));assert.deepEqual(where.AND.at(-1).id.in,['linked-ticket']);}
 }
});
test('case return links preserve team filters and reject external or unrelated destinations',()=>{
 const {caseQueuePath,staffLandingPath,bookingStatusLabel}=load('src/lib/staff-workspace-ui.ts');
 assert.equal(caseQueuePath('SAFETY','/dashboard/cases?team=safety&view=team&q=Alex&page=2'),'/dashboard/cases?team=safety&view=team&q=Alex&page=2');
 for(const input of ['https://evil.invalid/dashboard/cases?team=safety','//evil.invalid/dashboard/cases','/dashboard/bookings','/dashboard/cases?team=customer-support'])assert.equal(caseQueuePath('SAFETY',input),'/dashboard/cases?team=safety');
 assert.equal(staffLandingPath('ADMIN'),'/dashboard/bookings');assert.equal(staffLandingPath('SAFETY'),'/dashboard/teams/safety');
 assert.equal(bookingStatusLabel('DELIVERED','RIDE'),'Completed');assert.equal(bookingStatusLabel('DELIVERED','DELIVERY'),'Delivered');
});
test('staff workload deep links show the selected owner instead of intersecting with unassigned work',async()=>{
 let where;const db={supportTicket:{count:async args=>{where=args.where;return 1},findMany:async()=>[]}};
 const Page=load('src/components/review-pages.tsx',{'@/lib/db':{db},'@/lib/staff-access':{requireStaffPage:async()=>({id:'admin',role:'ADMIN'})}}).SupportPage;
 const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({assigned:'selected-staff'})}));
 assert(where.AND.some(part=>part.assignedAdminId==='selected-staff'));assert(!where.AND.some(part=>part.assignedAdminId===null));assert.match(html,/All requests/);
});
