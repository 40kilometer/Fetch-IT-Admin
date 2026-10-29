import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { staffRoute, StaffError, text } from "@/lib/staff-http";
import { caseScope, hasPermission, supportScope } from "@/lib/staff-policy";
export const GET=staffRoute(undefined,async(req,staff)=>{
  const kind=req.nextUrl.searchParams.get('kind');
  const cases=await db.workflowCase.findMany({where:{AND:[caseScope(staff),...(kind?[{kind}]:[])]},orderBy:{updatedAt:'desc'},take:50,select:{id:true,kind:true,title:true,status:true,priority:true,assignedToId:true,version:true,updatedAt:true}});
  return NextResponse.json({cases});
});
export const POST=staffRoute(undefined,async(req,staff)=>{
  const body=await req.json();const kind=body.kind;
  if(!['FINANCE','SAFETY','ESCALATION'].includes(kind)) throw new StaffError('Choose a valid case type.');
  if(kind==='FINANCE'&&!hasPermission(staff.role,'operations')) throw new StaffError('Financial decisions are handled by Admin.',403);
  if(!hasPermission(staff.role,kind==='FINANCE'?'finance':kind==='SAFETY'?'safety':'support')&&!hasPermission(staff.role,'support')) throw new StaffError('You cannot create this case.',403);
  const ticketId=typeof body.ticketId==='string'&&body.ticketId?body.ticketId:undefined;
  const ticket=ticketId?await db.supportTicket.findFirst({where:{id:ticketId,...supportScope(staff)}}):null;
  if(ticketId && (!hasPermission(staff.role,'support')||!ticket)) throw new StaffError('Support request unavailable.',404);
  // Support can route a case to another team, without receiving that team's evidence access.
  if(hasPermission(staff.role,'support')&&!hasPermission(staff.role,kind==='FINANCE'?'finance':kind==='SAFETY'?'safety':'support')&&!ticket) throw new StaffError('Link an accessible support request.');
  const booking=body.bookingRef?await db.booking.findUnique({where:{refCode:text(body.bookingRef,100)},select:{id:true,customerId:true}}):null;
  if(body.bookingRef&&!booking) throw new StaffError('Booking not found.',404);
  if(booking&&hasPermission(staff.role,'support')&&!hasPermission(staff.role,'operations')&&(!ticket?.bookingId||ticket.bookingId!==booking.id)) throw new StaffError('Link the support request belonging to this booking.',403);
  if(ticket?.bookingId&&booking&&ticket.bookingId!==booking.id) throw new StaffError('Choose the booking linked to this request.');
  if(staff.role==='SUPPORT' && (!ticket || ticket.assignedAdminId!==staff.id)) throw new StaffError('Claim this customer request before sending a handoff.',403);
  const handoff=!!ticket && kind!=='FINANCE';
  if(staff.role==='SUPPORT' && !handoff) throw new StaffError('Send the handoff from its customer conversation.',400);
  if(!['LOW','NORMAL','HIGH','URGENT'].includes(body.priority)) throw new StaffError('Choose how urgent this handoff is.');
  const summary=handoff ? `${kind==='SAFETY'?'Why does this need Safety Review?':'Why do you need supervisor help?'}\n${text(body.helpReason,1800)}\n\nWhat have you already tried?\n${text(body.tried,1800)}` : text(body.summary,4000);
  const saved=await db.$transaction(async tx=>{
    if(ticket){
      await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id"=${ticket.id} FOR UPDATE`;
      const current=await tx.supportTicket.findFirst({where:{id:ticket.id,...supportScope(staff)}});
      if(!current || staff.role==='SUPPORT'&&current.assignedAdminId!==staff.id) throw new StaffError('This request was reassigned. Refresh before sending.',409);
      const existing=await tx.workflowCase.findFirst({where:{ticketId:ticket.id,kind,status:{not:'RESOLVED'}}});
      if(existing) throw new StaffError('An open handoff to this destination already exists. Add information to the existing case.',409);
    }
    const record=await tx.workflowCase.create({data:{kind,title:text(body.title,160),summary,status:'OPEN',priority:['LOW','NORMAL','HIGH','URGENT'].includes(body.priority)?body.priority:'NORMAL',ticketId,bookingId:ticket?.bookingId??booking?.id,subjectUserId:ticket?.customerId??booking?.customerId,createdById:staff.id,createdByName:staff.name}});
    await tx.adminAudit.create({data:{actorId:staff.id,actorName:staff.name,action:'CASE_CREATED',entityType:'CASE',entityId:record.id,details:{kind,ticketId:ticketId??null}}});return record;
  });
  return NextResponse.json({message:handoff?'Your handoff was sent. Track updates in My escalated requests.':'Case submitted to the review queue.',id:saved.id},{status:201});
});
