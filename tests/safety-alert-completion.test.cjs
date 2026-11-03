const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file,mocks={}){
 const full=path.resolve(file),exports={};
 new Function('exports','require',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(exports,name=>mocks[name]??require(name));return exports;
}
test('notification completion metadata remains Admin-only and uses the current case version',async()=>{
 const {notificationFeed}=load('src/lib/staff-notifications.ts');
 const row={id:'notice',entityType:'CASE',entityId:'alert',title:'Safety alert',detail:'Review the passenger report.',createdAt:new Date(),urgent:true,read:false,safetyReview:true,completionVersion:4,claimKind:null,revision:'4'};
 for(const role of ['ADMIN','SAFETY','SUPPORT','SUPPORT_SUPERVISOR','SUPERADMIN']){
  const db={$queryRaw:async()=>[row]},feed=await notificationFeed(db,{id:'actor',role},'personal');
  assert.equal(feed.items[0].completion?.version,role==='ADMIN'?4:undefined);
 }
 for(const change of [{completionVersion:null},{completionVersion:undefined},{completionVersion:'4'},{entityType:'APPLICATION'}]){
  const feed=await notificationFeed({$queryRaw:async()=>[{...row,...change}]},{id:'admin',role:'ADMIN'},'personal');assert.equal(feed.items[0].completion,undefined);
 }
});
test('completion control posts the current version and resolution; failed saves retain the confirmation',async()=>{
 let refreshed=0,completed=0,body,ok=false;
 const originalFetch=global.fetch;
 global.fetch=async(url,options)=>{assert.equal(url,'/api/cases/alert%2Fid');body=JSON.parse(options.body);return Response.json(ok?{message:'Done'}:{error:'This alert changed. Refresh and review it.'},{status:ok?200:409});};
 try{
  const ref={current:null};let initialized=false;
  const {SafetyAlertDone}=load('src/components/safety-alert-done.tsx',{'next/navigation':{useRouter:()=>({refresh(){refreshed++;}})},'react':{useRef(value){if(!initialized){ref.current=value;initialized=true;}return ref;}},'./confirm-dialog':{ConfirmDialog:()=>null}});
  const control=SafetyAlertDone({id:'alert/id',version:4,onDone(){completed++;}});
  assert.equal(control.props.trigger,'Mark as done');assert(control.props.reasonLabel);assert.match(control.props.description,/no customer message is sent/);
  control.props.onOpen();
  const refreshedControl=SafetyAlertDone({id:'alert/id',version:5,onDone(){completed++;}});
  await assert.rejects(refreshedControl.props.onConfirm('Passenger confirmed the issue was handled.'),/This alert changed/);assert.equal(body.version,4,'Polling cannot replace the version reviewed when the dialog opened');assert.equal(completed,0);assert.equal(refreshed,0);
  refreshedControl.props.onOpen();
  ok=true;await refreshedControl.props.onConfirm('Passenger confirmed the issue was handled.');assert.equal(body.action,'complete-alert');assert.equal(body.version,5);assert.equal(body.reason,'Passenger confirmed the issue was handled.');assert.equal(completed,1);assert.equal(refreshed,1);
 }finally{global.fetch=originalFetch;}
});
