const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file,mocks={},cache=new Map()){
 const full=path.resolve(file);if(cache.has(full))return cache.get(full);const exports={};cache.set(full,exports);
 new Function('exports','require',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(exports,name=>{if(mocks[name])return mocks[name];if(name.startsWith('.'))return load(path.resolve(path.dirname(full),name+'.ts'),mocks,cache);return require(name);});return exports;
}
function fixture(){
 const actor={id:'safety',name:'Assigned Safety Reviewer',role:'SAFETY'},record={id:'case',kind:'SAFETY',status:'IN_REVIEW',assignedToId:'safety',ticketId:'ticket',bookingId:'booking',subjectUserId:'customer',createdAt:new Date('2026-01-01'),version:2};
 const ticket={id:'ticket',customerId:'customer',bookingId:'booking',status:'IN_PROGRESS',assignedAdminId:'cs',lastCustomerMessageAt:new Date('2026-01-01'),lastAdminReplyAt:null};
 const booking={id:'booking',customerId:'customer',riderId:'rider'},people={customer:{id:'customer',name:'Customer',role:'CUSTOMER',phone:'09123456789'},rider:{id:'rider',name:'Rider',role:'RIDER',phone:'+639123456789'}};
 const audits=[],notes=[],messages=[],notifications=[],updates=[];
 const db={$queryRaw:async()=>[],workflowCase:{findFirst:async()=>({...record}),update:async({data})=>{record.version++;updates.push(data);return {...record};}},booking:{findUnique:async()=>({...booking})},supportTicket:{findUnique:async()=>({...ticket}),findUniqueOrThrow:async()=>({...ticket}),update:async({data})=>Object.assign(ticket,data)},user:{findUnique:async({where})=>people[where.id]??null},adminAudit:{create:async({data})=>{audits.push(data);return data;}},workflowNote:{create:async({data})=>{notes.push(data);return data;}},supportMessage:{create:async({data})=>{const message={id:'reply',...data};messages.push(message);return message;}}};
 class StaffError extends Error{constructor(message,status=400){super(message);this.status=status;}}
 const module=load('src/lib/safety-case-actions.ts',{'./staff-http':{StaffError,text(value,max){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new StaffError('Invalid text');return value.trim();}},'./customer-notifications':{enqueueSupportNotification:async(_,message,title)=>notifications.push({message,title})}});
 return {actor,record,ticket,booking,people,audits,notes,messages,notifications,updates,contact:body=>module.safetyCaseContact(db,'case',actor,body),work:body=>module.safetyCaseWork(db,'case',actor,{version:record.version,...body})};
}
test('only the active assigned Safety reviewer can access contacts or message the customer',async()=>{
 for(const change of [{assignedToId:null},{assignedToId:'other'},{kind:'ESCALATION'},{status:'RESOLVED'}]){
  const f=fixture();Object.assign(f.record,change);await assert.rejects(f.contact({action:'contacts'}));await assert.rejects(f.work({action:'reply',reply:'Are you safe?'}));assert.equal(f.messages.length,0);assert.equal(f.audits.length,0);
 }
 const f=fixture();f.actor.role='SUPPORT_SUPERVISOR';await assert.rejects(f.contact({action:'contacts'}),e=>e.status===403);
});
test('contact details are limited to linked participants and opening a dialer records only an attempt',async()=>{
 const f=fixture(),result=await f.contact({action:'contacts'});assert.equal(result.contacts.customer.phone,'09123456789');assert.equal(result.contacts.rider.name,'Rider');
 assert.equal(f.audits[0].action,'CASE_CONTACTS_VIEWED');assert(!JSON.stringify(f.audits[0].details).includes('09123456789'));
 const call=await f.contact({action:'call-start',target:'rider',phone:'09000000000',participantId:'arbitrary'});assert.equal(call.dial,'tel:+639123456789');assert.equal(f.audits[1].action,'CASE_CALL_STARTED');assert.equal(f.notes.length,0);assert.equal(f.notifications.length,0);assert.equal(f.record.version,2);
 f.people.rider.phone=null;await assert.rejects(f.contact({action:'call-start',target:'rider'}),e=>e.status===409);
});
test('conflicting case, ticket or booking participants fail closed',async()=>{
 for(const change of ['subject','customer','booking']){
  const f=fixture();if(change==='subject')f.record.subjectUserId='other';if(change==='customer')f.booking.customerId='other';if(change==='booking')f.ticket.bookingId='other';
  await assert.rejects(f.contact({action:'contacts'}),e=>e.status===409);await assert.rejects(f.work({action:'reply',reply:'Unsafe link'}),e=>e.status===409);assert.equal(f.messages.length,0);
 }
});
test('Safety reply goes to the existing customer thread with a notification, without taking over CS ownership or resolving work',async()=>{
 const f=fixture();await f.work({action:'reply',reply:' Please confirm whether you are safe. '});
 assert.equal(f.messages[0].authorRole,'SAFETY');assert.equal(f.messages[0].body,'Please confirm whether you are safe.');assert.equal(f.messages[0].ticketId,'ticket');
 assert.equal(f.notifications[0].title,'Fetch-It Safety Review replied');assert.equal(f.audits[0].action,'CASE_CUSTOMER_REPLY');assert.equal(f.audits[0].details.internal,false);
 assert.equal(f.ticket.assignedAdminId,'cs');assert.equal(f.ticket.status,'IN_PROGRESS');assert.equal(f.record.status,'IN_REVIEW');assert.equal(f.record.version,3);
 assert(f.ticket.lastAdminReplyAt>f.ticket.lastCustomerMessageAt);assert.equal(f.notes.length,0);
});
test('a stale version, resolved/missing conversation or missing customer cannot send',async()=>{
 for(const change of ['stale','closed','missing','wrong-role']){
  const f=fixture();const body={action:'reply',reply:'Update'};if(change==='stale')body.version=1;if(change==='closed')f.ticket.status='RESOLVED';if(change==='missing')f.record.ticketId=null;if(change==='wrong-role')f.people.customer.role='RIDER';
  await assert.rejects(f.work(body),e=>e.status===409);assert.equal(f.messages.length,0);assert.equal(f.notifications.length,0);
 }
});
test('call outcome requires a linked participant, time, result and notes; it stays private',async()=>{
 const f=fixture();await f.work({action:'call-log',target:'rider',outcome:'NO_ANSWER',calledAt:'2026-01-02T12:30',note:'No answer. Retry after checking the customer response.'});
 assert.match(f.notes[0].body,/Outcome: no answer/);assert.match(f.notes[0].body,/2026-01-02T04:30:00.000Z/);assert.equal(f.audits[0].action,'CASE_CALL_LOGGED');assert.equal(f.audits[0].details.internal,true);assert.equal(f.notifications.length,0);assert.equal(f.messages.length,0);
 for(const body of [{target:'outsider'},{outcome:'SUCCESS'},{calledAt:'2099-01-01T12:30'},{note:''}]){const v=fixture();await assert.rejects(v.work({action:'call-log',target:'customer',outcome:'ANSWERED',calledAt:'2026-01-02T12:30',note:'Follow-up recorded.',...body}));assert.equal(v.notes.length,0);}
});
