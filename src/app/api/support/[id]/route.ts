import { withRequestLog } from "@/lib/request-guard";
import { NextRequest, NextResponse } from "next/server";
import { currentStaff } from "@/lib/staff-access";
import { supportScope,hasPermission } from "@/lib/staff-policy";
import { db } from "@/lib/db";
import { enqueueSupportNotification } from "@/lib/customer-notifications";
class RequestError extends Error {constructor(message:string,public status=400){super(message)}}
async function handlePATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await currentStaff('support');
    if (!admin) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const body = await request.json().catch(() => null);
    if(!body||!["claim","reply","resolve","reassign","reopen"].includes(body.action))throw new RequestError("Choose a request action. Status changes automatically when you claim, reply, resolve or reopen.");
    if(body.status!==undefined||body.priority!==undefined)throw new RequestError("Request status is managed by actions. Set priority on the team handoff instead.");
    if(typeof body.updatedAt!=="string"||!Number.isFinite(Date.parse(body.updatedAt)))throw new RequestError("Refresh this request before continuing.",409);
    const reply=typeof body.reply==='string'?body.reply.trim():"";
    if((body.action==='reply'||body.action==='resolve')&&(!reply||reply.length>2000))throw new RequestError("Write a reply of up to 2,000 characters before sending.");
    const { id } = await params;
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id" = ${id} FOR UPDATE`;
      // Read access, ownership and version again under the lock. A second
      // claimant can never overwrite the first, including an Admin claimant.
      const ticket=await tx.supportTicket.findFirst({where:{id,...supportScope(admin)}});
      if(!ticket)throw new RequestError(body.action==='claim'?"This request is no longer unassigned in your queue. Another staff member may have claimed it. Refresh to continue.":"Request unavailable in your queue.",body.action==='claim'?409:404);
      if(body.action==='claim'&&ticket.assignedAdminId&&ticket.assignedAdminId!==admin.id){
        const owner=await tx.user.findUnique({where:{id:ticket.assignedAdminId},select:{name:true}});
        throw new RequestError(`This request is already under review by ${owner?.name??'another staff member'}. Refresh to see the current owner.`,409);
      }
      if(body.updatedAt!==ticket.updatedAt.toISOString())throw new RequestError("This request changed. Refresh to see the latest owner and messages.",409);
      const manages=hasPermission(admin.role,'support.manage'),owned=ticket.assignedAdminId===admin.id;
      let status=ticket.status,assignee=ticket.assignedAdminId;
      let reason:string|undefined;
      if(body.action==='reopen'){
        if(!manages)throw new RequestError("Admin or a support supervisor must reopen a resolved request.",403);
        if(ticket.status!=='RESOLVED')throw new RequestError("Only resolved requests can be reopened.",409);
        const reopeningReason:string=typeof body.reason==='string'?body.reason.trim():'';
        if(reopeningReason.length<5||reopeningReason.length>2000)throw new RequestError("Explain why this request needs reopening in 5–2,000 characters.");
        reason=reopeningReason;
        status=assignee?'IN_PROGRESS':'OPEN';
      }else{
        if(ticket.status==='RESOLVED')throw new RequestError("This request is resolved. Reopen it before making changes.",409);
        if(body.action==='claim'){
          if(owned&&ticket.status==='IN_PROGRESS')throw new RequestError("You already own this request. Refresh to continue.",409);
          assignee=admin.id;status='IN_PROGRESS';
        }else if(body.action==='reassign'){
          if(!manages)throw new RequestError("Only Admin or a support supervisor can reassign requests.",403);
          if(body.assignedAdminId!==null&&typeof body.assignedAdminId!=='string')throw new RequestError("Choose an active support team member.");
          assignee=body.assignedAdminId||null;
          if(assignee){const assigned=await tx.user.findUnique({where:{id:assignee},select:{role:true,isBanned:true}});if(!assigned||!['ADMIN','SUPPORT','SUPPORT_SUPERVISOR'].includes(assigned.role)||assigned.isBanned)throw new RequestError("Choose an active support team member.");}
          if(assignee===ticket.assignedAdminId)throw new RequestError("Choose a different owner before reassigning.");
          status=assignee?'IN_PROGRESS':'OPEN';
        }else{
          if(!owned)throw new RequestError("Claim this request or have it reassigned to you before replying.",403);
          status=body.action==='resolve'?'RESOLVED':'IN_PROGRESS';
        }
      }
      await tx.supportTicket.update({where:{id},data:{status,assignedAdminId:assignee,updatedAt:new Date(Math.max(Date.now(),ticket.updatedAt.getTime()+1))}});
      const publicReply=body.action==='reply'||body.action==='resolve';
      if(publicReply){
        const createdAt = new Date(Math.max(Date.now(), ticket.lastCustomerMessageAt.getTime() + 1, (ticket.lastAdminReplyAt?.getTime() ?? 0) + 1));
        const message=await tx.supportMessage.create({data:{ticketId:id,authorId:admin.id,authorName:admin.name,authorRole:admin.role,body:reply,createdAt}});
        await enqueueSupportNotification(tx,message);
        await tx.supportTicket.update({where:{id},data:{lastAdminReplyAt:message.createdAt,updatedAt:new Date(Math.max(Date.now(),ticket.updatedAt.getTime()+1))}});
      }
      await tx.adminAudit.create({data:{actorId:admin.id,actorName:admin.name,action:`SUPPORT_${String(body.action).toUpperCase()}`,entityType:'SUPPORT',entityId:id,details:{from:ticket.status,status,previousAssignedAdminId:ticket.assignedAdminId,assignedAdminId:assignee,replyAdded:publicReply,...(reason?{reason}:{})}}});
      return tx.supportTicket.findUnique({where:{id},include:{assignedAdmin:{select:{name:true}}}});
    });
    return NextResponse.json({ticket:result});
  }catch(error){return NextResponse.json({error:error instanceof RequestError?error.message:"Couldn’t update the request. Your unsent reply is preserved. Please retry."},{status:error instanceof RequestError?error.status:503})}
}
export const PATCH = withRequestLog("admin:support/[id]:PATCH", handlePATCH);
