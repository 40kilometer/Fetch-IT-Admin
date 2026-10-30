const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react');
function harness(){const slots=[];let cursor=0;const calls={refresh:0,reset:0,fetch:0},react={...React,useId:()=> 'confirm',useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=v]},useRef(initial){return slots[cursor++]??=( {current:initial})}};
 const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync('src/components/action-form.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(exports,name=>name.endsWith('staff-drafts')?{useStaffDraft:()=>({candidate:null,status:'',capture(){},clear(){},restore(){}}),DraftNotice:()=>null}:name==='react'?react:name==='next/navigation'?{useRouter:()=>({refresh:()=>calls.refresh++,push(){}})}:require(name));
 const props={url:'/api/cases/test',method:'PATCH',hidden:{action:'decide',version:1},fields:[{name:'reason',label:'Reason'}],label:'Approve recommendation',confirm:true};
 const render=()=>{cursor=0;return exports.ActionForm(props)},nodes=tree=>[tree,...(Array.isArray(tree?.props?.children)?tree.props.children:[tree?.props?.children]).filter(Boolean).flatMap(child=>Array.isArray(child)?child.flatMap(nodes):typeof child==='object'?nodes(child):[])];
 let tree=render();const form=nodes(tree).find(n=>n.type==='form'),dialog=nodes(tree).find(n=>n.type==='dialog');form.props.ref.current={reset:()=>calls.reset++};dialog.props.ref.current={showModal(){},close(){}};
 return {calls,render,nodes,props,submit(){nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}})},confirm(){nodes(render()).filter(n=>n.type==='button').at(-1).props.onClick()}};
}
for(const [label,response] of [['conflict',()=>Response.json({error:'Record changed'},{status:409})],['expired session',()=>Response.json({error:'Sign in again'},{status:401})],['network failure',()=>{throw Error('Connection interrupted')}]])test(`a ${label} keeps entered text, allows recovery and never shows success`,async()=>{
 const oldFetch=global.fetch,oldFormData=global.FormData,h=harness();let resolve;
 global.FormData=class{get(){return 'Preserve this reason'}};
 global.fetch=async()=>{h.calls.fetch++;return new Promise(r=>resolve=r)};
 try{
  h.submit();h.confirm();h.confirm();assert.equal(h.calls.fetch,1);assert(h.nodes(h.render()).some(n=>n.props?.['aria-busy']===true));
  try{resolve(response())}catch(error){resolve(Promise.reject(error))}await new Promise(setImmediate);
  assert.equal(h.calls.reset,0);assert.equal(h.calls.refresh,0);assert(h.nodes(h.render()).some(n=>n.props?.role==='alert'));assert(!h.nodes(h.render()).some(n=>n.props?.className==='success-message'));
  if(label==='conflict'){h.nodes(h.render()).find(n=>n.type==='button'&&n.props.children==='Refresh record (keep entered text)').props.onClick();assert.equal(h.calls.refresh,1);assert.equal(h.calls.reset,0)}
  global.fetch=async(url,options)=>{assert.equal(JSON.parse(options.body).reason,'Preserve this reason');return Response.json({message:'Decision saved'})};
  h.props.hidden.version=2;h.submit();h.confirm();await new Promise(setImmediate);assert.equal(h.calls.reset,1);assert(h.nodes(h.render()).some(n=>n.props?.className==='success-message'));
 }finally{global.fetch=oldFetch;global.FormData=oldFormData}
});
