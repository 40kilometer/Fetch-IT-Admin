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
function harness(role='SAFETY',store=storage(),initiallyBlocked=false){
 const slots=[],effects=[],instances=[],events=new Map(),documentEvents=new Map();let cursor=0,tones=0,actor='safety',blocked=initiallyBlocked;
 class Context{
  constructor(){this.state='suspended';this.currentTime=0;this.destination={};this.waiters=[];instances.push(this);}
  async resume(){if(blocked==='pending')return new Promise(resolve=>this.waiters.push(resolve));if(blocked)throw Error('Audio needs a user interaction. Your preference remains on.');this.state='running';this.waiters.splice(0).forEach(resolve=>resolve());this.onstatechange?.();}async close(){this.state='closed';}
  createOscillator(){return{frequency:{setValueAtTime(){}},connect(){},disconnect(){},start(){tones++;},stop(){}};}
  createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
 }
 const react={...React,useRef(initial){const index=cursor++;return slots[index]??={current:initial};},useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],value=>slots[index]=typeof value==='function'?value(slots[index]):value];},useCallback(callback){return callback;},useEffect(callback,deps){const index=cursor++,old=slots[index];if(!old||deps.some((dep,i)=>!Object.is(dep,old.deps[i]))){slots[index]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[index].cleanup?.();slots[index].cleanup=callback();});}}};
 const globals={document:{visibilityState:'visible',addEventListener:(key,callback)=>documentEvents.set(key,callback),removeEventListener:key=>documentEvents.delete(key)},localStorage:store,navigator:{locks:{request:async(_,callback)=>callback()}},window:{AudioContext:Context,addEventListener:(key,callback)=>events.set(key,callback),removeEventListener:key=>events.delete(key)}};
 const {useSafetyAlertSound}=load('src/components/safety-alert-sound.tsx',globals,{react});
 const render=()=>{cursor=0;const sound=useSafetyAlertSound(actor,role);while(effects.length)effects.shift()();return sound;};
 const button=label=>nodes(render().controls).find(node=>node.type==='button'&&node.props.children===label);
 render();return{render,button,instances,store,events,documentEvents,setBlocked(value){blocked=value;},get tones(){return tones;},setActor(id){actor=id;render();},unmount(){slots.forEach(slot=>slot?.cleanup?.());}};
}
test('only Admin and Safety receive sound controls; test preview does not enable automatic sounds',async()=>{
 for(const role of ['SUPPORT','SUPPORT_SUPERVISOR','SUPERADMIN'])assert.equal(harness(role).render().controls,null);
 for(const role of ['ADMIN','SAFETY']){
  const h=harness(role);h.render().observe([]);await h.button('Test sound').props.onClick();await new Promise(setImmediate);
  assert.equal(h.tones,6);assert.equal(h.render().enabled.current,false);
  h.render().observe([notice('new')]);await new Promise(setImmediate);assert.equal(h.tones,6);h.unmount();
 }
});
test('enabling plays a preview, new safety alerts chime once, unrelated alerts stay silent, and mute closes audio',async()=>{
 const h=harness();h.render().observe([notice('old')]);await h.button('Enable safety sounds').props.onClick();await new Promise(setImmediate);
 assert.equal(h.render().enabled.current,true);assert.equal(h.tones,6);
 h.render().observe([notice('old'),notice('cs',{safetyReview:false})]);assert.equal(h.tones,6);
 h.render().observe([notice('new')]);await new Promise(setImmediate);assert.equal(h.tones,12);
 h.render().observe([notice('new')]);await new Promise(setImmediate);assert.equal(h.tones,12);
 h.button('Mute safety sounds').props.onClick();h.render().observe([notice('muted')]);await new Promise(setImmediate);assert.equal(h.tones,12);assert.equal(h.instances.at(-1).state,'closed');
 await h.button('Enable safety sounds').props.onClick();await new Promise(setImmediate);assert.equal(h.tones,18);
 h.render().observe([notice('muted')]);await new Promise(setImmediate);assert.equal(h.tones,18);h.unmount();assert.equal(h.instances.at(-1).state,'closed');
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

test('saved On and Off preferences are restored after a reload without previewing the backlog',async()=>{
 const store=storage(),first=harness('SAFETY',store);
 first.button('Enable safety sounds').props.onClick();await new Promise(setImmediate);
 assert.equal(store.getItem(lib.safetySoundKey('safety')),'on');first.unmount();
 const restored=harness('SAFETY',store);await new Promise(setImmediate);
 assert.equal(restored.render().enabled.current,true);assert(restored.button('Mute safety sounds'));
 restored.render().observe([notice('backlog')]);await new Promise(setImmediate);assert.equal(restored.tones,0);
 restored.button('Mute safety sounds').props.onClick();restored.unmount();
 const muted=harness('SAFETY',store);assert.equal(muted.render().enabled.current,false);assert(muted.button('Enable safety sounds'));muted.unmount();
});

test('browser suspension keeps preference On and retains a new alert until audio resumes',async()=>{
 const h=harness();h.render().observe([]);h.button('Enable safety sounds').props.onClick();await new Promise(setImmediate);
 h.instances.at(-1).state='suspended';h.instances.at(-1).onstatechange();h.setBlocked(true);
 h.render().observe([notice('while-paused')]);await new Promise(setImmediate);
 assert.equal(h.render().enabled.current,true);assert.equal(h.store.getItem(lib.safetySoundKey('safety')),'on');assert(h.button('Mute safety sounds'));assert(h.button('Resume audio'));assert.equal(h.tones,6);
 h.setBlocked(false);h.events.get('focus')();await new Promise(setImmediate);assert.equal(h.tones,12);
 h.events.get('focus')();h.render().observe([notice('while-paused')]);await new Promise(setImmediate);assert.equal(h.tones,12);h.unmount();
});

test('a blocked startup resume does not lock controls and the next interaction restores audio silently',async()=>{
 const store=storage();store.setItem(lib.safetySoundKey('safety'),'on');
 const h=harness('SAFETY',store,'pending');assert.equal(h.render().enabled.current,true);assert(h.button('Mute safety sounds'));
 h.render().observe([notice('backlog')]);h.setBlocked(false);h.events.get('pointerdown')();await new Promise(setImmediate);
 assert.equal(h.render().enabled.current,true);assert.equal(h.instances.at(-1).state,'running');assert.equal(h.tones,0);
 h.instances.at(-1).state='suspended';h.setBlocked('pending');h.events.get('focus')();
 h.button('Mute safety sounds').props.onClick();assert.equal(h.render().enabled.current,false);assert.equal(store.getItem(lib.safetySoundKey('safety')),'off');h.unmount();
});

test('On changes in another tab are restored, while changed-account audio and pending alerts are discarded',async()=>{
 const h=harness();h.store.setItem(lib.safetySoundKey('safety'),'on');h.events.get('storage')({key:lib.safetySoundKey('safety'),newValue:'on'});await new Promise(setImmediate);
 assert.equal(h.render().enabled.current,true);assert.equal(h.tones,0);
 h.instances.at(-1).state='suspended';h.setBlocked('pending');h.render().observe([]);h.render().observe([notice('pending')]);
 h.setActor('another');assert.equal(h.render().enabled.current,false);assert.equal(h.instances.at(-1).state,'closed');
 h.setBlocked(false);h.events.get('pointerdown')();await new Promise(setImmediate);assert.equal(h.tones,0);h.unmount();
});

test('playback failure cannot consume the shared alert receipt',()=>{
 const store=storage();let played=0;
 assert.throws(()=>lib.reserveSafetyChime(store,'heard',['new'],100000,()=>{throw Error('suspended');}),/suspended/);
 assert.equal(store.getItem('heard'),null);
 assert.equal(lib.reserveSafetyChime(store,'heard',['new'],100001,()=>played++),true);
 assert.equal(lib.reserveSafetyChime(store,'heard',['new'],100002,()=>played++),false);assert.equal(played,1);
 store.setItem('bad','invalid');lib.reserveSafetyChime(store,'bad',['new'],100003);assert.equal(lib.reserveSafetyChime(store,'bad',['new'],100004),false);
});
