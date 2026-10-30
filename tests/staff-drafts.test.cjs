const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react');
function load(file,mocks={}){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(exports,name=>mocks[name]??require(name));return exports}
const store=load('src/lib/staff-drafts.ts');
test('session recovery returns only to a normalized local dashboard record',()=>{
 const {staffReturnPath}=load('src/lib/staff-return-path.ts');assert.equal(staffReturnPath('/dashboard/cases/123?view=mine'),'/dashboard/cases/123?view=mine');
 for(const input of [null,'https://example.com','//example.com','/dashboard/../../login','/dashboardevil','/\\example.com'])assert.equal(staffReturnPath(input),'/dashboard');
});
function memory(){const data=new Map();return {get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}}
function view(storage,account='admin:ADMIN',record='case:1:decision',revision='1'){
 const slots=[],effects=[];let cursor=0;const restored=[];
 const react={...React,useContext:()=>account,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=v]},useRef(initial){return slots[cursor++]??={current:initial}},useEffect:fn=>effects.push(fn)};
 const exports=load('src/components/staff-drafts.tsx',{react,'@/lib/staff-drafts':store});
 const render=()=>{cursor=0;return exports.useStaffDraft(record,revision,values=>restored.push(values))};
 let draft=render();const cleanup=effects[0]();draft=render();return{render,restored,cleanup,guard:exports.StaffDraftGuard};
}
test('storage separates accounts, roles and records and expires only draft keys',()=>{
 const s=memory(),key=store.draftKey('admin:ADMIN','case:1');store.writeDraft(s,key,{reason:'Saved reasoning'},'1',100);
 assert.equal(store.readDraft(s,store.draftKey('safety:SAFETY','case:1'),101),null);assert.equal(store.readDraft(s,store.draftKey('admin:SUPPORT','case:1'),101),null);assert.equal(store.readDraft(s,store.draftKey('admin:ADMIN','case:2'),101),null);
 s.setItem('unrelated','keep');store.pruneDrafts(s,100+store.DRAFT_TTL+1);assert.equal(s.getItem(key),null);assert.equal(s.getItem('unrelated'),'keep');
});
test('restoration is explicit, survives unmount, warns about changed records, and clear removes it',()=>{
 const old=global.localStorage;global.localStorage=memory();try{
  const a=view(localStorage);a.render().capture({reason:'Unsubmitted decision'});assert.match(a.render().status,/Draft saved/);a.cleanup();
  const b=view(localStorage,'admin:ADMIN','case:1:decision','2');assert(b.render().candidate);assert(b.render().changed);assert.equal(b.restored.length,0);b.render().restore();assert.deepEqual(b.restored,[{reason:'Unsubmitted decision'}]);assert.match(b.render().status,/Draft restored/);b.render().clear();assert.equal(localStorage.length,0);b.cleanup();
 }finally{global.localStorage=old}
});
test('failed submission can retain the draft, while empty text removes it and credentials are excluded',()=>{
 const s=memory(),key=store.draftKey('admin','record');store.writeDraft(s,key,{notes:'Keep notes',password:'excluded',apiToken:'excluded'},'1');assert.deepEqual(store.readDraft(s,key).values,{notes:'Keep notes'});assert(store.readDraft(s,key));store.writeDraft(s,key,{notes:' '},'2');assert.equal(s.getItem(key),null);
});
test('blocked storage reports unsaved work instead of claiming it is saved',()=>{
 const old=global.localStorage;global.localStorage={getItem(){return null},setItem(){throw Error('quota')},removeItem(){}};try{const v=view(localStorage);v.render().capture({reason:'Keep this page'});assert.match(v.render().status,/Couldn’t save/);v.cleanup()}finally{global.localStorage=old}
});
test('reload and navigation guards warn only for unfinished work and clean up listeners',()=>{
 const previous={storage:global.localStorage,window:global.window,document:global.document,location:global.location};global.localStorage=memory();const listeners={},doc={};let confirms=0;
 global.window={addEventListener:(k,v)=>listeners[k]=v,removeEventListener:k=>delete listeners[k],confirm:()=>{confirms++;return false}};global.document={addEventListener:(k,v)=>doc[k]=v,removeEventListener:k=>delete doc[k]};global.location={origin:'https://admin.invalid',pathname:'/dashboard/cases/1',search:''};
 try{
  // Register the guard and dirty draft from the same module instance.
  const guardEffects=[];const react={...React,useContext:()=> 'guard',useState:initial=>[initial,()=>{}],useRef:initial=>({current:initial}),useEffect:fn=>guardEffects.push(fn)};
  const guardModule=load('src/components/staff-drafts.tsx',{react,'@/lib/staff-drafts':store});const draft=guardModule.useStaffDraft('record','1',()=>{});guardEffects.shift()();draft.capture({reason:'Draft'});guardModule.StaffDraftGuard();const cleanup=guardEffects.shift()();let blocked=0;listeners.beforeunload({preventDefault(){blocked++}});assert.equal(blocked,1);
  doc.click({button:0,target:{closest:()=>({href:'https://admin.invalid/dashboard',target:'',hasAttribute:()=>false})},preventDefault(){blocked++},stopPropagation(){}});assert.equal(confirms,1);assert.equal(blocked,2);
  guardModule.allowStaffAccountReload();listeners.beforeunload({preventDefault(){blocked++}});assert.equal(blocked,2);cleanup();assert.deepEqual(listeners,{});assert.deepEqual(doc,{});
 }finally{global.localStorage=previous.storage;global.window=previous.window;global.document=previous.document;global.location=previous.location}
});
