import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {staffRoute,StaffError,text} from '@/lib/staff-http';
import {supportScope,hasPermission} from '@/lib/staff-policy';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){const{id}=await params;return staffRoute('support',async(request,staff)=>{
  const body=await request.json();
  await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id"=${id} FOR UPDATE`;
    const ticket=await tx.supportTicket.findFirst({where:{id,...supportScope(staff)}});if(!ticket)throw new StaffError('Request unavailable.',404);
    if(!hasPermission(staff.role,'support.manage')&&ticket.assignedAdminId!==staff.id)throw new StaffError('Claim this request before adding a note.',403);
    await tx.supportInternalNote.create({data:{ticketId:id,authorId:staff.id,authorName:staff.name,body:text(body.note,4000)}});
    await tx.adminAudit.create({data:{actorId:staff.id,actorName:staff.name,action:'SUPPORT_NOTE_ADDED',entityType:'SUPPORT',entityId:id,details:{internal:true}}});
  });return NextResponse.json({message:'Internal note added. It is not sent to the customer.'});})(req);}
