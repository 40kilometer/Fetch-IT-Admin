const test=require('node:test'),assert=require('node:assert/strict');
const {BATCH,NEW_STAFF,buildActivity}=require('../scripts/expand-staff-team.cjs');
test('expanded team activity stays linked, role-scoped, traceable and chronologically valid',()=>{
  const now=new Date('2026-11-02T10:00:00Z'),old=new Date('2026-10-01T10:00:00Z');
  const staff=[{id:'cs',role:'SUPPORT'},{id:'supervisor',role:'SUPPORT_SUPERVISOR'},{id:'safety',role:'SAFETY'}].map(s=>({...s,name:s.id,createdAt:old})).concat(NEW_STAFF.map(s=>({...s,createdAt:new Date(now.getTime()-1000)})));
  const customers=Array.from({length:24},(_,i)=>({id:'customer'+i,name:'Customer '+i,createdAt:old}));
  const admin={id:'admin',name:'Admin'},plan=buildActivity({customers,staff,admin,now});
  assert.equal(plan.tickets.length,24);assert.equal(plan.cases.length,10);
  assert.deepEqual(new Set(plan.tickets.map(t=>t.status)),new Set(['OPEN','IN_PROGRESS','RESOLVED']));
  for(const member of staff) {
    const workload=['SUPPORT','SUPPORT_SUPERVISOR'].includes(member.role)?plan.tickets.filter(t=>t.assignedAdminId===member.id&&t.status!=='RESOLVED'):plan.cases.filter(c=>c.assignedToId===member.id&&c.status!=='RESOLVED');
    assert(workload.length>0,member.name+' needs active work');
  }
  for(const ticket of plan.tickets) {
    assert.equal(ticket.bookingId,null);assert(ticket.updatedAt>=ticket.createdAt);assert(ticket.updatedAt<=now);
    const messages=plan.messages.filter(m=>m.ticketId===ticket.id);assert.equal(messages[0].body,ticket.message);assert.equal(messages[0].authorId,ticket.customerId);
    if(ticket.status==='OPEN'){assert.equal(ticket.assignedAdminId,null);assert.equal(messages.length,1);}
    else {assert.equal(messages[1].authorId,ticket.assignedAdminId);assert(messages[1].createdAt>=ticket.createdAt);}
  }
  for(const record of plan.cases) {
    const ticket=plan.tickets.find(t=>t.id===record.ticketId);assert.equal(record.subjectUserId,ticket.customerId);assert.equal(record.bookingId,null);
    assert(record.updatedAt>=record.createdAt);assert(record.updatedAt<=now);
    if(record.assignedToId)assert.equal(staff.find(s=>s.id===record.assignedToId).role,record.kind==='SAFETY'?'SAFETY':'SUPPORT_SUPERVISOR');
    if(record.kind==='SAFETY'&&record.status==='RESOLVED'){assert.equal(record.decidedById,admin.id);assert.notEqual(record.decidedById,record.assignedToId);assert(record.recommendation);}
  }
  for(const event of plan.audits) {
    assert.equal(event.details.synthetic,true);assert.equal(event.details.batch,BATCH);assert(event.createdAt<=now);
    const actor=staff.find(s=>s.id===event.actorId);if(actor)assert(event.createdAt>=actor.createdAt,event.action+' predates its actor');
  }
  assert.equal(new Set(plan.audits.map(a=>a.id)).size,plan.audits.length);
});
