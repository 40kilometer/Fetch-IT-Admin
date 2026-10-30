const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),Next=require('next/server');
function loader(mocks={}){
 const cache=new Map();return function load(file){const full=path.resolve(file);if(cache.has(full))return cache.get(full);const exports={};cache.set(full,exports);
  new Function('exports','require',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(exports,name=>{
   if(Object.hasOwn(mocks,name))return mocks[name];if(name.startsWith('.')||name.startsWith('@/'))return load((name.startsWith('@/')?'src/'+name.slice(2):path.resolve(path.dirname(full),name))+'.ts');return require(name);
  });return exports;
 };
}
function logoutView(){
 const slots=[];let cursor=0;const calls={announce:0,allow:0,navigate:[]};
 const react={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=v]},useRef(initial){return slots[cursor++]??={current:initial}}};
 const {LogoutButton}=loader({react,'@/lib/staff-session-sync':{announceStaffSessionChange(){calls.announce++}},'@/components/staff-drafts':{allowStaffAccountReload(){calls.allow++}}})('src/app/dashboard/logout-button.tsx');
 const render=()=>{cursor=0;return LogoutButton()},nodes=tree=>[tree,...(Array.isArray(tree?.props?.children)?tree.props.children:[tree?.props?.children]).filter(Boolean).flatMap(child=>Array.isArray(child)?child.flatMap(nodes):typeof child==='object'?nodes(child):[])];
 return{calls,render,nodes,click:()=>nodes(render()).find(n=>n.type==='button').props.onClick()};
}
test('logout locks immediately, shows progress, and navigates once after confirmed success',async()=>{
 const old={window:global.window,fetch:global.fetch};let finish,requests=0,confirms=0;const v=logoutView();
 global.window={confirm:()=>{confirms++;return true},location:{assign:url=>v.calls.navigate.push(url)}};global.fetch=()=>{requests++;return new Promise(resolve=>finish=resolve)};
 try{v.click();v.click();assert.equal(requests,1);assert.equal(confirms,1);assert(v.nodes(v.render()).some(n=>n.props?.role==='status'));assert(v.nodes(v.render()).find(n=>n.type==='button').props.disabled);
  finish(Response.json({ok:true}));await new Promise(setImmediate);assert.deepEqual(v.calls,{announce:1,allow:1,navigate:['/login']});
 }finally{Object.assign(global,old)}
});
test('failed logout keeps the workspace, reports the problem and allows a retry',async()=>{
 const old={window:global.window,fetch:global.fetch};const v=logoutView();global.window={confirm:()=>true,location:{assign:url=>v.calls.navigate.push(url)}};
 try{for(const response of [()=>{throw Error('offline')},()=>Response.json({error:'Unavailable'},{status:503}),()=>new Response('Unavailable',{status:502})]){
   global.fetch=async()=>response();v.click();await new Promise(setImmediate);assert(v.nodes(v.render()).some(n=>n.props?.role==='alert'));assert.equal(v.calls.allow,0);assert.deepEqual(v.calls.navigate,[]);assert.equal(v.nodes(v.render()).find(n=>n.type==='button').props.disabled,false);
  }
  global.fetch=async()=>Response.json({ok:true});v.click();await new Promise(setImmediate);assert.deepEqual(v.calls.navigate,['/login']);
 }finally{Object.assign(global,old)}
});
test('logout cancellation sends no request; cleared cookies with cleanup failure get an honest sign-in notice',async()=>{
 const old={window:global.window,fetch:global.fetch};const v=logoutView();let requests=0;global.window={confirm:()=>false,location:{assign:url=>v.calls.navigate.push(url)}};global.fetch=async()=>{requests++;return Response.json({signedOut:true},{status:503})};
 try{v.click();assert.equal(requests,0);window.confirm=()=>true;v.click();await new Promise(setImmediate);assert.equal(requests,1);assert.deepEqual(v.calls.navigate,['/login?logout=cleanup-pending']);assert.equal(v.calls.announce,1)}finally{Object.assign(global,old)}
});
test('a committed save returns before email delivery and a failed sender cannot change its success',async()=>{
 const callbacks=[];let deliver,deliveries=0,reads=0;
 const app={id:'app',status:'ORIENTATION_SCHEDULED',emails:[{id:'email',kind:'ORIENTATION',status:'PENDING'}]};
 const load=loader({'next/server':{...Next,after:fn=>callbacks.push(fn)},'./db':{db:{riderApplication:{findUniqueOrThrow:async()=>{reads++;return app}}}},'./rider-application':{canReviewApplications:()=>true,reviewApplication:async()=>app,publicApplication:value=>value},'./application-storage':{},'./request-guard':{},'./application-mail':{sendApplicationEmail:()=>{deliveries++;return new Promise(resolve=>deliver=resolve)}}});
 const response=await load('src/lib/application-staff-api.ts').staffApplicationRequest(new Next.NextRequest('https://admin.invalid/api/rider-applications/app',{method:'POST',body:JSON.stringify({action:'schedule'})}),{role:'ADMIN'},'app');
 assert.equal(response.status,200);assert.equal((await response.json()).application.emails[0].status,'PENDING');assert.equal(reads,0);assert.equal(deliveries,0);assert.equal(callbacks.length,1);
 const task=callbacks[0]();assert.equal(deliveries,1);deliver();await task;
 const warn=console.warn;const warnings=[];console.warn=value=>warnings.push(JSON.parse(value));try{
  const {scheduleApplicationEmail}=loader({'next/server':{after:fn=>callbacks.push(fn)},'./application-mail':{sendApplicationEmail:async()=>{throw Error('private SMTP response')}}})('src/lib/application-email-delivery.ts');scheduleApplicationEmail('email');await callbacks[1]();assert.deepEqual(warnings,[{operation:'application:email',code:'DELIVERY_DEFERRED'}]);
 }finally{console.warn=warn}
});
test('staff timing headers separate authentication from action time and preserve private error responses',async()=>{
 const load=loader({'./staff-access':{currentStaff:async()=>({id:'staff',role:'ADMIN'})}}),{staffRoute,StaffError}=load('src/lib/staff-http.ts');
 const request=new Next.NextRequest('https://admin.invalid/api/cases/test',{method:'PATCH',headers:{origin:'https://admin.invalid'}});
 for(const handler of [async()=>Response.json({ok:true}),async()=>{throw new StaffError('Record changed',409)}]){
  const response=await staffRoute(undefined,handler)(request);assert.match(response.headers.get('server-timing'),/^auth;dur=\d+\.\d, action;dur=\d+\.\d, total;dur=\d+\.\d$/);assert.match(response.headers.get('x-request-id'),/^[a-f0-9-]{36}$/);assert.equal(response.headers.get('cache-control'),'private, no-store');
 }
});
