const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
function load(file,globals={},mocks={},cache=new Map()){
 const full=path.resolve(file);if(cache.has(full))return cache.get(full);const exports={};cache.set(full,exports);
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,console,Date,...globals,require(name){if(mocks[name])return mocks[name];if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?'src/'+name.slice(2):path.resolve(path.dirname(full),name);return load(base+(fs.existsSync(base+'.ts')?'.ts':'.tsx'),globals,mocks,cache);}return require(name);}},{filename:full});return exports;
}
const lib=load('src/lib/safety-alert-sound.ts');
const notice=(id,extra={})=>({id,safetyReview:true,read:false,entityType:'CASE',entityId:id,...extra});
test('safety sound ignores initial backlog, read alerts and other teams, and deduplicates across views',()=>{
 const tracker=new lib.SafetyAlertTracker();assert.equal(tracker.observe([notice('existing')]).length,0);
 const items=[notice('existing'),notice('new'),notice('new'),notice('read',{read:true}),notice('cs',{safetyReview:false}),notice('legacy',{safetyReview:undefined})];
 assert.equal(JSON.stringify(tracker.observe(items)),JSON.stringify(['new']));
 assert.equal(tracker.observe(items).length,0);assert.equal(tracker.observe([]).length,0);assert.equal(tracker.observe(items).length,0);
 assert.equal(tracker.observe([notice('read',{read:false})]).length,0,'marking unread is not a new event');
});
test('new application and case event IDs on an existing record can chime, but mute does not accumulate a backlog',()=>{
 const tracker=new lib.SafetyAlertTracker();tracker.observe([]);
 assert.equal(tracker.observe([notice('assignment',{entityType:'APPLICATION',entityId:'same-record'})]).length,1);
 // The caller still observes snapshots while muted.
 tracker.observe([notice('muted-update')]);
 assert.equal(tracker.observe([notice('muted-update')]).length,0);
 assert.equal(tracker.observe([notice('decision',{entityType:'APPLICATION',entityId:'same-record'})]).length,1);
});
function storage(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),values};}
test('shared chime receipts suppress duplicate tabs and short bursts, and remain account-scoped',()=>{
 const store=storage(),key=lib.safetySoundKey('staff-a')+':heard';
 assert.equal(lib.reserveSafetyChime(store,key,['one'],100000),true);
 assert.equal(lib.reserveSafetyChime(store,key,['one'],120000),false);
 assert.equal(lib.reserveSafetyChime(store,key,['two'],105000),false);
 assert.equal(lib.reserveSafetyChime(store,key,['three'],110000),true);
 assert.equal(lib.reserveSafetyChime(store,lib.safetySoundKey('staff-b')+':heard',['one'],110000),true);
 assert.equal(lib.reserveSafetyChime(store,key,[],120000),false);
});
test('blocked storage does not break the current tab chime and malformed receipts recover',()=>{
 const store=storage();store.setItem('bad','broken JSON');assert.equal(lib.reserveSafetyChime(store,'bad',['one'],100000),true);
 assert.equal(lib.reserveSafetyChime({getItem(){throw Error('blocked');},setItem(){}},'key',['one'],100000),true);
});
const nodes=tree=>[tree,...(Array.isArray(tree?.props?.children)?tree.props.children:[tree?.props?.children]).filter(Boolean).flatMap(child=>Array.isArray(child)?child.flatMap(nodes):typeof child==='object'?nodes(child):[])];
function harness(role='SAFETY'){
 const slots=[],effects=[],instances=[],events=new Map(),store=storage();let cursor=0,tones=0,actor='safety';
 class Context{
  constructor(){this.state='suspended';this.currentTime=0;this.destination={};instances.push(this);}
  async resume(){this.state='running';}async close(){this.state='closed';}
  createOscillator(){return{frequency:{setValueAtTime(){}},connect(){},disconnect(){},start(){tones++;},stop(){}};}
  createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
 }
 const react={...React,useRef(initial){const index=cursor++;return slots[index]??={current:initial};},useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],value=>slots[index]=typeof value==='function'?value(slots[index]):value];},useCallback(callback){return callback;},useEffect(callback,deps){const index=cursor++,old=slots[index];if(!old||deps.some((dep,i)=>!Object.is(dep,old.deps[i]))){slots[index]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[index].cleanup?.();slots[index].cleanup=callback();});}}};
 const globals={localStorage:store,navigator:{locks:{request:async(_,callback)=>callback()}},window:{AudioContext:Context,addEventListener:(key,callback)=>events.set(key,callback),removeEventListener:key=>events.delete(key)}};
 const {useSafetyAlertSound}=load('src/components/safety-alert-sound.tsx',globals,{react});
 const render=()=>{cursor=0;const sound=useSafetyAlertSound(actor,role);while(effects.length)effects.shift()();return sound;};
 const button=label=>nodes(render().controls).find(node=>node.type==='button'&&node.props.children===label);
 render();return{render,button,instances,store,events,get tones(){return tones;},setActor(id){actor=id;render();},unmount(){slots.forEach(slot=>slot?.cleanup?.());}};
}
test('only Admin and Safety receive sound controls; test preview does not enable automatic sounds',async()=>{
 for(const role of ['SUPPORT','SUPPORT_SUPERVISOR','SUPERADMIN'])assert.equal(harness(role).render().controls,null);
 for(const role of ['ADMIN','SAFETY']){
  const h=harness(role);h.render().observe([]);await h.button('Test sound').props.onClick();await new Promise(setImmediate);
  assert.equal(h.tones,2);assert.equal(h.render().enabled.current,false);
  h.render().observe([notice('new')]);await new Promise(setImmediate);assert.equal(h.tones,2);h.unmount();
 }
});
test('enabling plays a preview, new safety alerts chime once, unrelated alerts stay silent, and mute closes audio',async()=>{
 const h=harness();h.render().observe([notice('old')]);await h.button('Enable safety sounds').props.onClick();await new Promise(setImmediate);
 assert.equal(h.render().enabled.current,true);assert.equal(h.tones,2);
 h.render().observe([notice('old'),notice('cs',{safetyReview:false})]);assert.equal(h.tones,2);
 h.render().observe([notice('new')]);await new Promise(setImmediate);assert.equal(h.tones,4);
 h.render().observe([notice('new')]);await new Promise(setImmediate);assert.equal(h.tones,4);
 h.button('Mute safety sounds').props.onClick();h.render().observe([notice('muted')]);await new Promise(setImmediate);assert.equal(h.tones,4);assert.equal(h.instances.at(-1).state,'closed');
 await h.button('Enable safety sounds').props.onClick();await new Promise(setImmediate);assert.equal(h.tones,6);
 h.render().observe([notice('muted')]);await new Promise(setImmediate);assert.equal(h.tones,6);h.unmount();assert.equal(h.instances.at(-1).state,'closed');
});
test('switching accounts or muting in another tab stops audio and discards pending alerts',async()=>{
 const h=harness();h.render().observe([]);await h.button('Enable safety sounds').props.onClick();await new Promise(setImmediate);
 h.events.get('storage')({key:lib.safetySoundKey('safety'),newValue:'off'});assert.equal(h.render().enabled.current,false);assert.equal(h.instances.at(-1).state,'closed');
 await h.button('Enable safety sounds').props.onClick();await new Promise(setImmediate);h.setActor('other');
 assert.equal(h.render().enabled.current,false);assert.equal(h.instances.at(-1).state,'closed');assert.equal(h.render().observe([notice('old')]),undefined);h.unmount();
});
test('server feed preserves its trusted safety classification in the response',async()=>{
 const {notificationFeed}=load('src/lib/staff-notifications.ts');
 const rows=[{...notice('safety'),createdAt:new Date(),title:'Safety',detail:'Review',urgent:false,claimKind:null,revision:null},{...notice('cs',{safetyReview:false,entityType:'SUPPORT'}),createdAt:new Date(),title:'CS',detail:'Reply',urgent:false,claimKind:null,revision:null}];
 const response=await notificationFeed({$queryRaw:async()=>rows},{id:'admin',role:'ADMIN'},'personal');
 assert.equal(response.items[0].safetyReview,true);assert.equal(response.items[1].safetyReview,false);
});
