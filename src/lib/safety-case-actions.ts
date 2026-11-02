import type {Prisma} from '@prisma/client';
import {StaffError,text} from './staff-http';
import {caseScope,hasPermission} from './staff-policy';
import {enqueueSupportNotification} from './customer-notifications';

type Actor={id:string;name:string;role:string};
export async function ownedSafetyCase(tx:Prisma.TransactionClient,id:string,actor:Actor){
  const record=await tx.workflowCase.findFirst({where:{id,...caseScope(actor)}});
  if(!record||record.kind!=='SAFETY')throw new StaffError('Safety case unavailable.',404);
  if(!hasPermission(actor.role,'safety')||record.assignedToId!==actor.id)throw new StaffError('Only the assigned Safety reviewer can contact participants. Claim the case first.',403);
  if(record.status==='RESOLVED')throw new StaffError('This case is resolved. Its history is read-only.',409);
  return record;
}
export async function safetyParticipants(tx:Prisma.TransactionClient,record:{ticketId:string|null;bookingId:string|null;subjectUserId:string|null}){
  const [ticket,booking]=await Promise.all([
    record.ticketId?tx.supportTicket.findUnique({where:{id:record.ticketId},select:{id:true,customerId:true,bookingId:true,status:true}}):null,
    record.bookingId?tx.booking.findUnique({where:{id:record.bookingId},select:{id:true,customerId:true,riderId:true}}):null,
  ]);
  const customerId=ticket?.customerId??booking?.customerId??record.subjectUserId;
  if((ticket&&record.subjectUserId&&ticket.customerId!==record.subjectUserId)||(booking&&customerId!==booking.customerId)||(ticket?.bookingId&&record.bookingId&&ticket.bookingId!==record.bookingId))throw new StaffError('The linked participant records conflict. Ask Admin to correct the case links.',409);
  const [customer,rider]=await Promise.all([
    customerId?tx.user.findUnique({where:{id:customerId},select:{id:true,name:true,phone:true,role:true}}):null,
    booking?.riderId?tx.user.findUnique({where:{id:booking.riderId},select:{id:true,name:true,phone:true,role:true}}):null,
  ]);
  return {ticket,customer:customer?.role==='CUSTOMER'?customer:null,rider:rider?.role==='RIDER'?rider:null};
}
export async function safetyCaseContact(tx:Prisma.TransactionClient,id:string,actor:Actor,body:Record<string,unknown>){
  await tx.$queryRaw`SELECT "id" FROM "WorkflowCase" WHERE "id"=${id} FOR UPDATE`;
  const record=await ownedSafetyCase(tx,id,actor),participants=await safetyParticipants(tx,record);
  if(body.action==='contacts'){
    await tx.adminAudit.create({data:{actorId:actor.id,actorName:actor.name,action:'CASE_CONTACTS_VIEWED',entityType:'CASE',entityId:id,details:{customerAvailable:!!participants.customer?.phone,riderAvailable:!!participants.rider?.phone}}});
    const contact=(person:typeof participants.customer)=>person?{name:person.name,phone:person.phone}:null;
    return {contacts:{customer:contact(participants.customer),rider:contact(participants.rider)}};
  }
  if(!['customer','rider'].includes(String(body.target)))throw new StaffError('Choose customer or rider.');
  const person=body.target==='customer'?participants.customer:participants.rider;
  if(!person?.phone||!/^\+?[\d\s().-]{7,25}$/.test(person.phone))throw new StaffError('No callable number is recorded for this participant.',409);
  await tx.adminAudit.create({data:{actorId:actor.id,actorName:actor.name,action:'CASE_CALL_STARTED',entityType:'CASE',entityId:id,details:{target:String(body.target),participantId:person.id,note:'Dialer requested; this does not confirm that a call connected.'}}});
  return {dial:`tel:${person.phone.replace(/[^\d+]/g,'')}`,message:'Dialer opened. Record the call outcome after your attempt.'};
}
export async function safetyCaseWork(tx:Prisma.TransactionClient,id:string,actor:Actor,body:Record<string,unknown>){
  await tx.$queryRaw`SELECT "id" FROM "WorkflowCase" WHERE "id"=${id} FOR UPDATE`;
  const record=await ownedSafetyCase(tx,id,actor);
  if(body.version!==record.version)throw new StaffError('This case changed. Refresh before sending or logging a call.',409);
  const participants=await safetyParticipants(tx,record);
  let details:Record<string,string|boolean>={internal:body.action==='call-log'},message:string;
  if(body.action==='reply'){
    if(!participants.ticket||!participants.customer)throw new StaffError('This case needs a linked customer support conversation before sending a reply.',409);
    await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id"=${participants.ticket.id} FOR UPDATE`;
    const ticket=await tx.supportTicket.findUniqueOrThrow({where:{id:participants.ticket.id}});
    if(ticket.status==='RESOLVED')throw new StaffError('The customer conversation is resolved. Ask Admin to reopen it before replying.',409);
    const bodyText=text(body.reply,2000),createdAt=new Date(Math.max(Date.now(),ticket.lastCustomerMessageAt.getTime()+1,(ticket.lastAdminReplyAt?.getTime()??0)+1));
    const reply=await tx.supportMessage.create({data:{ticketId:ticket.id,authorId:actor.id,authorName:actor.name,authorRole:actor.role as 'SAFETY'|'ADMIN',body:bodyText,createdAt}});
    await enqueueSupportNotification(tx,reply,'Fetch-It Safety Review replied');
    await tx.supportTicket.update({where:{id:ticket.id},data:{lastAdminReplyAt:createdAt,updatedAt:createdAt}});
    details={ticketId:ticket.id,messageId:reply.id,internal:false};message='Safety reply sent to the customer. The case remains open for follow-up.';
  }else{
    if(!['customer','rider'].includes(String(body.target))||!['ANSWERED','NO_ANSWER','BUSY','UNREACHABLE'].includes(String(body.outcome)))throw new StaffError('Choose a participant and call outcome.');
    const person=body.target==='customer'?participants.customer:participants.rider;
    if(!person)throw new StaffError('The selected participant is not linked to this case.',409);
    const note=text(body.note,2000),at=text(body.calledAt,60),calledAt=new Date(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(at)?at+':00+08:00':at);
    if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)?$/.test(at)||!Number.isFinite(calledAt.getTime())||calledAt.getTime()>Date.now()+60000||calledAt<record.createdAt)throw new StaffError('Enter the call time after this case opened and no later than now.');
    const outcome=String(body.outcome).toLowerCase().replaceAll('_',' ');
    await tx.workflowNote.create({data:{caseId:id,authorId:actor.id,authorName:actor.name,body:`Call to ${body.target}: ${person.name}\nOutcome: ${outcome}\nCall time: ${calledAt.toISOString()}\n${note}`}});
    details={target:String(body.target),participantId:person.id,outcome:String(body.outcome),calledAt:calledAt.toISOString(),note,internal:true};message='Call outcome saved as a private note. No message was sent to the customer.';
  }
  await tx.workflowCase.update({where:{id},data:{version:{increment:1}}});
  await tx.adminAudit.create({data:{actorId:actor.id,actorName:actor.name,action:body.action==='reply'?'CASE_CUSTOMER_REPLY':'CASE_CALL_LOGGED',entityType:'CASE',entityId:id,details}});
  return {message};
}
