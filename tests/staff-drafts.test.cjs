const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react');
function load(file,mocks={}){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(exports,name=>mocks[name]??require(name));return exports}
const store=load('src/lib/staff-drafts.ts');
test('session recovery returns only to a normalized local dashboard record',()=>{
 const {staffReturnPath}=load('src/lib/staff-return-path.ts');assert.equal(staffReturnPath('/dashboard/cases/123?view=mine'),'/dashboard/cases/123?view=mine');
 for(const input of [null,'https://example.com','//example.com','/dashboard/../../login','/dashboardevil','/\\example.com'])assert.equal(staffReturnPath(input),'/dashboard');
});
function memory(){const data=new Map();return {get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}}
function view(storage,account='admin:ADMIN',record='case:1:decision',revision='1',options){
 const slots=[],effects=[];let cursor=0;const restored=[];
 const react={...React,useContext:()=>account,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=v]},useRef(initial){return slots[cursor++]??={current:initial}},useEffect:fn=>effects.push(fn)};
 const exports=load('src/components/staff-drafts.tsx',{react,'@/lib/staff-drafts':store});
 const render=()=>{cursor=0;return exports.useStaffDraft(record,revision,values=>restored.push(values),options)};
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

test('selections and cleared fields restore explicitly; reverting or committing resets the dirty baseline',()=>{
 const previous=global.localStorage;global.localStorage=memory();
 try{const options={baseline:{status:'OPEN',attended:'false',venue:'Original venue'},labels:{status:'Request status',attended:'Attendance',venue:'Venue'}};
  const v=view(localStorage,'staff:SAFETY','app:1','1',options);v.render().capture({status:'IN_PROGRESS',attended:'true',venue:''});assert.match(v.render().status,/Request status, Attendance, Venue/);v.cleanup();
  const reopened=view(localStorage,'staff:SAFETY','app:1','2',options);assert.equal(reopened.restored.length,0);reopened.render().restore();assert.deepEqual(reopened.restored,[{status:'IN_PROGRESS',attended:'true',venue:''}]);
  reopened.render().capture(options.baseline);assert.equal(localStorage.length,0);assert.equal(reopened.render().status,'');
  const saved={status:'IN_PROGRESS',attended:'true',venue:'New venue'};reopened.render().clear(saved);reopened.render().capture(saved);assert.equal(localStorage.length,0);reopened.cleanup();
  const cleared=view(localStorage,'staff:ADMIN','cleared','1',{baseline:{notes:'Original'},labels:{notes:'Notes'}});cleared.render().capture({notes:''});assert.equal(localStorage.length,1);cleared.cleanup();
 }finally{global.localStorage=previous}
});

test('links, refresh and browser traversal share a cancellable dialog without changing history state',async()=>{
 const previous={localStorage:global.localStorage,window:global.window,document:global.document,location:global.location};
 const listeners={},doc={},nav={},destinations=[];let traversals=0;
 global.localStorage=memory();global.location={origin:'https://admin.invalid',pathname:'/dashboard/cases/1',search:''};
 global.window={addEventListener:(key,fn)=>listeners[key]=fn,removeEventListener:key=>delete listeners[key],location:{assign:url=>destinations.push(url)},navigation:{addEventListener:(key,fn)=>nav[key]=fn,removeEventListener:key=>delete nav[key],traverseTo(key){traversals++;const event=backEvent(key);nav.navigate(event);assert.equal(event.blocked,0);return{finished:Promise.resolve()}}}};
 global.document={addEventListener:(key,fn)=>doc[key]=fn,removeEventListener:key=>delete doc[key]};
 const values=[],effects=[];let cursor=0;const react={...React,useContext:()=> 'guard:ADMIN',useState(initial){const slot=cursor++;if(!(slot in values))values[slot]=initial;return[values[slot],value=>values[slot]=value]},useRef(initial){return values[cursor++]??={current:initial}},useEffect:fn=>effects.push(fn)};
 const module=load('src/components/staff-drafts.tsx',{react,'@/lib/staff-drafts':store});
 const renderDraft=()=>{cursor=0;return module.useStaffDraft('record','1',()=>{},{baseline:{services:'[]'},labels:{services:'Selected services'}})};
 const draft=renderDraft();effects.shift()();draft.capture({services:'["DELIVERY"]'});
 const guardOffset=values.length;const renderGuard=()=>{cursor=guardOffset;return module.StaffDraftGuard()};
 const nodes=tree=>[tree,...(Array.isArray(tree?.props?.children)?tree.props.children:[tree?.props?.children]).filter(Boolean).flatMap(child=>Array.isArray(child)?child.flatMap(nodes):typeof child==='object'?nodes(child):[])];
 const choose=name=>nodes(renderGuard()).find(node=>node.type==='button'&&node.props.children===name).props.onClick();
 function backEvent(key='previous'){return{navigationType:'traverse',hashChange:false,cancelable:true,destination:{key,sameDocument:true,url:'https://admin.invalid/dashboard'},blocked:0,preventDefault(){this.blocked++}}}
 let cleanup;
 try{
  renderGuard();effects.shift()();cleanup=effects.shift()();let blocked=0;listeners.beforeunload({preventDefault(){blocked++}});assert.equal(blocked,1);
  const link={href:'https://admin.invalid/dashboard',target:'',hasAttribute:()=>false};doc.click({button:0,target:{closest:()=>link},preventDefault(){blocked++},stopPropagation(){}});assert.equal(blocked,2);assert.deepEqual(destinations,[]);assert(nodes(renderGuard()).some(node=>node.type==='li'&&node.props.children==='Selected services'));
  choose('Stay here');await new Promise(setImmediate);assert.deepEqual(destinations,[]);
  const refresh=module.confirmStaffNavigation('Refresh with unsaved changes?');choose('Stay here');assert.equal(await refresh,false);
  const back=backEvent();nav.navigate(back);assert.equal(back.blocked,1);choose('Stay here');await new Promise(setImmediate);assert.equal(traversals,0);
  nav.navigate(backEvent());choose('Continue');await new Promise(setImmediate);assert.equal(traversals,1);
  const nonCancelable=backEvent();nonCancelable.cancelable=false;nav.navigate(nonCancelable);assert.equal(nonCancelable.blocked,0);
  module.allowStaffAccountReload();const clean=backEvent();nav.navigate(clean);assert.equal(clean.blocked,0);assert.equal(await module.confirmStaffNavigation(),true);
 }finally{cleanup?.();assert.deepEqual(listeners,{});assert.deepEqual(doc,{});assert.deepEqual(nav,{});Object.assign(global,previous)}
});
