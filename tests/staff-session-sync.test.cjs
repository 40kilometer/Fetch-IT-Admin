const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function harness(responses){
 const events={},docEvents={},destinations=[],timers=new Set();let calls=0,aborted=false;
 const document={visibilityState:'visible',addEventListener:(k,v)=>docEvents[k]=v,removeEventListener:k=>delete docEvents[k]};
 const window={addEventListener:(k,v)=>events[k]=v,removeEventListener:k=>delete events[k],setInterval:fn=>{timers.add(fn);return fn},clearInterval:fn=>timers.delete(fn)};
 const exports={};
 const fetch=async(url,options)=>{assert.equal(url,'/api/auth/session');assert.equal(options.cache,'no-store');options.signal.addEventListener('abort',()=>aborted=true);calls++;const item=responses.shift();if(item instanceof Error)throw item;return {status:item.status??200,ok:!item.status||item.status===200,json:async()=>item.body}};
 new Function('exports','window','document','fetch','AbortController','localStorage',ts.transpileModule(fs.readFileSync('src/lib/staff-session-sync.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,window,document,fetch,AbortController,{setItem(){throw Error('blocked')}});
 return {exports,events,docEvents,document,timers,destinations,start:status=>exports.watchStaffSession({id:'cs',role:'SUPPORT'},url=>destinations.push(url),status),flush:()=>new Promise(resolve=>setImmediate(resolve)),get calls(){return calls},get aborted(){return aborted}};
}
test('a different account in another tab reloads the entire role workspace once',async()=>{
 const h=harness([{body:{id:'cs',role:'SUPPORT'}},{body:{id:'safety',role:'SAFETY'}}]);const stop=h.start();await h.flush();assert.deepEqual(h.destinations,[]);
 h.events.storage({key:'unrelated'});await h.flush();assert.equal(h.calls,1);
 h.events.storage({key:h.exports.STAFF_SESSION_CHANGED});await h.flush();assert.deepEqual(h.destinations,['/dashboard/workspace']);h.events.focus();await h.flush();assert.equal(h.calls,2);
 stop();assert(h.aborted);assert.equal(h.timers.size,0);assert.deepEqual(Object.keys(h.events),[]);assert.deepEqual(Object.keys(h.docEvents),[]);
});
test('focus also catches a role change to the same user without storage support',async()=>{
 const h=harness([{body:{id:'cs',role:'SUPPORT'}},{body:{id:'cs',role:'FINANCE'}}]);const stop=h.start();await h.flush();h.exports.announceStaffSessionChange();h.events.focus();await h.flush();assert.deepEqual(h.destinations,['/dashboard/workspace']);stop();
});
test('hidden tabs wait until visible; an expired session goes to login',async()=>{
 const h=harness([{status:401}]);h.document.visibilityState='hidden';const stop=h.start();await h.flush();assert.equal(h.calls,0);h.document.visibilityState='visible';h.docEvents.visibilitychange();await h.flush();assert.deepEqual(h.destinations,['/login']);stop();
});
test('temporary failures retain the current account and retry; unmounted requests cannot navigate',async()=>{
 const h=harness([{status:503},new Error('offline'),{body:{id:'other',role:'ADMIN'}}]);const stop=h.start();await h.flush();h.events.focus();await h.flush();assert.deepEqual(h.destinations,[]);h.events.focus();stop();await h.flush();assert.deepEqual(h.destinations,[]);
});

 test('expiry callbacks keep forms mounted and report the server expiry without extending it',async()=>{
 const expiresAt='2026-10-30T12:00:00.000Z',h=harness([{status:401},{body:{id:'cs',role:'SUPPORT',expiresAt}}]),statuses=[];const stop=h.start(value=>statuses.push(value));await h.flush();assert.deepEqual(h.destinations,[]);assert.deepEqual(statuses,[{expired:true}]);h.events.focus();await h.flush();assert.deepEqual(statuses.at(-1),{expired:false,expiresAt});assert.deepEqual(h.destinations,[]);stop();
});
