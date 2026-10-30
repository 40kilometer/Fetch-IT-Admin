const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {NextRequest}=require('next/server');
const root=path.resolve(__dirname,'..');

function loader(mocks={},directory=root) {
  const cache=new Map();
  function load(file) {
    const filename=path.resolve(directory,file);if(cache.has(filename))return cache.get(filename);
    const exports={};cache.set(filename,exports);
    const localRequire=name=>{
      if(name.endsWith('staff-drafts'))return {useStaffDraft:()=>({candidate:null,status:'',capture(){},clear(){},restore(){}}),DraftNotice:()=>null,confirmStaffNavigation:async()=>true};
      if(Object.hasOwn(mocks,name))return mocks[name];
      if(name.endsWith('.css'))return {};
      if(name.startsWith('@/')||name.startsWith('.')){
        const base=name.startsWith('@/')?path.join(directory,'src',name.slice(2)):path.resolve(path.dirname(filename),name);
        return load(base+(fs.existsSync(base+'.ts')?'.ts':'.tsx'));
      }
      return require(name);
    };
    new Function('exports','require',ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(exports,localRequire);
    return exports;
  }
  return load;
}
const queue=loader()('src/lib/application-queue.ts');
const rows=['DRAFT','SUBMITTED','IN_REVIEW','NEEDS_CORRECTION','RECOMMENDED','ORIENTATION_SCHEDULED','ASSESSED','DEMO_COMPLETED','ACTIVE','REJECTED','FORCE_APPROVAL_PENDING'].map((status,index)=>({id:String(index),status,isDemo:index%2===0,user:{name:status,email:status+'@example.invalid'},vehicleClass:'MOTORCYCLE',services:['DELIVERY']}));
function apiFixture(directory=root) {
  const queries=[];
  const db={riderApplication:{async findMany(options){queries.push(options);return rows.filter(row=>!options.where.status||options.where.status.in.includes(row.status));},async count(){return 1;}}};
  const load=loader({'./db':{db},'./request-guard':{RateLimitError:class extends Error{}},'./application-mail':{},'./application-storage':{}},directory);
  const request=load('src/lib/application-staff-api.ts').staffApplicationRequest;
  return {queries,async get(status,role='ADMIN'){
    const url=new URL('https://admin.example.invalid/api/rider-applications');if(status!==undefined)url.searchParams.set('status',status);
    return request(new NextRequest(url),{id:'reviewer',name:'QA reviewer',role});
  }};
}
for(const directory of [root]) {
  const name=path.basename(directory);
  for(const option of queue.APPLICATION_STATUS_FILTERS)test(`${name}: ${option.label} returns exactly its workflow stages`,async()=>{
    const f=apiFixture(directory),response=await f.get(option.value);
    assert.equal(response.status,200);const body=await response.json();
    assert.deepEqual(body.applications.map(row=>row.status).sort(),[...option.statuses].sort());
    assert.equal(f.queries[0].where.isDemo,undefined,'Removing the entry-method control must not leave a hidden mode filter');
  });
}
test('All statuses and legacy direct links keep working; invalid statuses cannot silently show all records',async()=>{
  const f=apiFixture();assert.equal((await (await f.get()).json()).applications.length,rows.length);
  assert.deepEqual((await (await f.get('IN_REVIEW')).json()).applications.map(row=>row.status),['IN_REVIEW']);
  const before=f.queries.length;assert.equal((await f.get('INVALID')).status,400);assert.equal(f.queries.length,before);
  assert.equal((await f.get('ACTIVE','SUPPORT')).status,403);assert.equal(f.queries.length,before);
});

function hooks(){const values=[];let cursor=0;const effects=[];return {effects,react:{...require('react'),useState(initial){const slot=cursor++;if(!(slot in values))values[slot]=typeof initial==='function'?initial():initial;return [values[slot],value=>{values[slot]=typeof value==='function'?value(values[slot]):value;}];},useRef(initial){const slot=cursor++;return values[slot]??={current:initial};},useCallback(fn){return fn;},useEffect(fn){effects.push(fn);}},render(component,props){cursor=0;return component(props);}};}
function elements(tree){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(elements);return [tree,...elements(tree.props?.children)];}
const tick=()=>new Promise(setImmediate);
function client(directory=root,initialStatus='') {
  const h=hooks();
  const load=loader({react:h.react,'next/link':{__esModule:true,default:'a'},'@/hooks/use-local-demo':{useLocalDemo:()=>({enabled:false})},'@/hooks/use-visible-poll':{useVisiblePoll(){}}},directory);
  const component=load('src/components/rider-applications.tsx').RiderApplications;
  return {render:()=>h.render(component,{initialStatus}),load:()=>h.effects.at(-2)(),search:()=>h.effects.at(-1)()};
}
for(const directory of [root])test(`${path.basename(directory)}: selection filters without submitting and removes old results immediately`,async()=>{
  const original=global.fetch,requests=[];global.fetch=async url=>{const parsed=new URL(url,'https://admin.example.invalid');requests.push(parsed);const statuses=queue.applicationQueueStatuses(parsed.searchParams.get('status'));return Response.json({applications:rows.filter(row=>!statuses||statuses.includes(row.status))});};
  try{
    const view=client(directory);view.render();view.load();await tick();let tree=view.render();
    assert.equal(elements(tree).filter(e=>e.type==='select').length,1);
    assert(!elements(tree).some(e=>e.type==='option'&&e.props.children==='Recommended'));
    const select=elements(tree).find(e=>e.type==='select');select.props.onChange({target:{value:'PENDING_VERIFICATION'}});
    tree=view.render();assert.equal(elements(tree).filter(e=>e.props?.className==='oa-card oa-row').length,0);
    view.load();await tick();tree=view.render();
    assert.equal(requests.at(-1).searchParams.get('status'),'PENDING_VERIFICATION');assert.equal(requests.at(-1).searchParams.has('mode'),false);
    const names=elements(tree).filter(e=>e.type==='strong').map(e=>e.props.children);assert.deepEqual(names,['SUBMITTED','IN_REVIEW']);
  }finally{global.fetch=original;}
});
test('Rapid filter changes ignore an earlier response arriving after the latest selection',async()=>{
  const original=global.fetch;let staleResolve;
  global.fetch=async url=>new URL(url,'https://admin.example.invalid').searchParams.get('status')==='PENDING_VERIFICATION'?new Promise(resolve=>{staleResolve=resolve;}):Response.json({applications:rows.filter(row=>row.status==='ACTIVE')});
  try{
    const view=client();let tree=view.render();view.load();await tick();tree=view.render();
    elements(tree).find(e=>e.type==='select').props.onChange({target:{value:'PENDING_VERIFICATION'}});tree=view.render();view.load();
    elements(tree).find(e=>e.type==='select').props.onChange({target:{value:'ACTIVE'}});view.render();view.load();await tick();
    staleResolve(Response.json({applications:rows.filter(row=>row.status==='SUBMITTED')}));await tick();
    tree=view.render();assert.deepEqual(elements(tree).filter(e=>e.type==='strong').map(e=>e.props.children),['ACTIVE']);
  }finally{global.fetch=original;}
});
test('Changing status on a later page resets the cursor',async()=>{
  const original=global.fetch,requests=[];global.fetch=async url=>{requests.push(new URL(url,'https://admin.example.invalid'));return Response.json({applications:rows,nextCursor:'page-two'});};
  try{const view=client();view.render();view.load();await tick();let tree=view.render();elements(tree).find(e=>e.type==='button'&&e.props.children==='Next page').props.onClick();view.render();view.load();await tick();assert.equal(requests.at(-1).searchParams.get('cursor'),'page-two');tree=view.render();elements(tree).find(e=>e.type==='select').props.onChange({target:{value:'ACTIVE'}});view.render();view.load();await tick();assert.equal(requests.at(-1).searchParams.get('cursor'),'');}finally{global.fetch=original;}
});
test('Text search applies after a short typing pause without a Search button',async()=>{
  const original=global.fetch,requests=[];global.fetch=async url=>{requests.push(new URL(url,'https://admin.example.invalid'));return Response.json({applications:[]});};
  try{const view=client();let tree=view.render();view.load();await tick();tree=view.render();elements(tree).find(e=>e.type==='input'&&e.props.name==='q').props.onChange({target:{value:'  Alex  '}});tree=view.render();const cleanup=view.search();await new Promise(resolve=>setTimeout(resolve,280));view.render();view.load();await tick();cleanup();assert.equal(requests.at(-1).searchParams.get('q'),'Alex');assert(!elements(tree).some(e=>e.type==='button'&&e.props.children==='Search'));}finally{global.fetch=original;}
});
test('Old force-approval deep links select the visible admin-approval queue',()=>{
  const view=client(root,'FORCE_APPROVAL_PENDING');assert.equal(elements(view.render()).find(e=>e.type==='select').props.value,'PENDING_APPROVAL');
});
test('Submitting unchanged filters refreshes without leaving the list stuck loading',async()=>{
  const original=global.fetch;let requests=0;global.fetch=async()=>{requests++;return Response.json({applications:rows});};
  try{const view=client();view.render();view.load();await tick();const tree=view.render();elements(tree).find(e=>e.type==='form').props.onSubmit({preventDefault(){}});await tick();const next=view.render();assert.equal(requests,2);assert.equal(elements(next).filter(e=>e.props?.className==='oa-card oa-row').length,rows.length);}finally{global.fetch=original;}
});
