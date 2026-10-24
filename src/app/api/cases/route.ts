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
  const saved=await db.$transaction(async tx=>{
    const record=await tx.workflowCase.create({data:{kind,title:text(body.title,160),summary:text(body.summary,4000),priority:['LOW','NORMAL','HIGH','URGENT'].includes(body.priority)?body.priority:'NORMAL',ticketId,bookingId:ticket?.bookingId??booking?.id,subjectUserId:ticket?.customerId??booking?.customerId,createdById:staff.id,createdByName:staff.name}});
    await tx.adminAudit.create({data:{actorId:staff.id,actorName:staff.name,action:'CASE_CREATED',entityType:'CASE',entityId:record.id,details:{kind,ticketId:ticketId??null}}});return record;
  });
  const visible=kind==='ESCALATION'||hasPermission(staff.role,kind==='FINANCE'?'finance':'safety');
  return NextResponse.json({message:'Case submitted to the review queue.',...(visible?{redirect:`/dashboard/cases/${saved.id}`}:{})},{status:201});
});
