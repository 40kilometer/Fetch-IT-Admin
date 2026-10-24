import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {staffRoute,StaffError,text} from '@/lib/staff-http';
import {caseScope,hasPermission} from '@/lib/staff-policy';
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return staffRoute(undefined,async(request,staff)=>{
    const body=await request.json();
    const result=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT "id" FROM "WorkflowCase" WHERE "id"=${id} FOR UPDATE`;
      const record=await tx.workflowCase.findFirst({where:{id,...caseScope(staff)}});
      if(!record) throw new StaffError('Case unavailable.',404);
      if(body.version!==record.version) throw new StaffError('This case changed. Refresh and try again.',409);
      const operations=hasPermission(staff.role,'operations');
      const canManage=operations || (record.kind==='ESCALATION'&&hasPermission(staff.role,'support.manage'));
      const owned=record.assignedToId===staff.id;
      let data:Record<string,unknown>={version:{increment:1}};
      if(body.action==='claim') {
        if(record.assignedToId&& !owned) throw new StaffError('This case is already assigned.',409);
        data={...data,assignedToId:staff.id,status:record.status==='OPEN'?'IN_REVIEW':record.status};
      } else if(body.action==='assign' && canManage) {
        const roles=record.kind==='FINANCE'?['FINANCE','ADMIN']:record.kind==='SAFETY'?['SAFETY','ADMIN']:['SUPPORT','SUPPORT_SUPERVISOR','ADMIN'];
        const assignee=await tx.user.findFirst({where:{id:text(body.assignedToId,100),role:{in:roles as ('ADMIN'|'FINANCE'|'SAFETY'|'SUPPORT'|'SUPPORT_SUPERVISOR')[]},isBanned:false}});
        if(!assignee) throw new StaffError('Choose an active reviewer for this team.');data={...data,assignedToId:assignee.id};
      } else if(body.action==='note') {
        if(!owned&&!canManage) throw new StaffError('Claim this case before adding evidence.',403);
        await tx.workflowNote.create({data:{caseId:id,authorId:staff.id,authorName:staff.name,body:text(body.note,4000)}});
      } else if(body.action==='recommend') {
        if(!owned&&!canManage) throw new StaffError('Claim this case before submitting a recommendation.',403);
        if(!['OPEN','IN_REVIEW','REJECTED'].includes(record.status)) throw new StaffError('This recommendation is already submitted.',409);
        data={...data,recommendation:text(body.recommendation,4000),status:'AWAITING_ADMIN',decidedById:null,decidedAt:null,decision:null};
      } else if(body.action==='decide' && operations) {
        if(record.status!=='AWAITING_ADMIN') throw new StaffError('No recommendation is awaiting a decision.',409);
        if(record.createdById===staff.id || record.assignedToId===staff.id) throw new StaffError('A different administrator must review your recommendation.',403);
        if(!['APPROVED','REJECTED'].includes(body.outcome)) throw new StaffError('Choose approve or reject.');
        data={...data,status:body.outcome,decision:text(body.reason,4000),decidedById:staff.id,decidedAt:new Date()};
      } else if(body.action==='close'&& (operations || record.kind==='ESCALATION'&&hasPermission(staff.role,'support.manage'))) {
        if(!['APPROVED','IN_REVIEW','OPEN'].includes(record.status)) throw new StaffError('This case cannot be closed yet.',409);
        if(record.kind!=='ESCALATION'&&record.status!=='APPROVED') throw new StaffError('An administrator must approve the recommendation first.',409);
        await tx.workflowNote.create({data:{caseId:id,authorId:staff.id,authorName:staff.name,body:`Resolution: ${text(body.reason,4000)}`}});data={...data,status:'RESOLVED'};
      } else throw new StaffError('You cannot perform this action.',403);
      const updated=await tx.workflowCase.update({where:{id},data});
      await tx.adminAudit.create({data:{actorId:staff.id,actorName:staff.name,action:`CASE_${String(body.action).toUpperCase()}`,entityType:'CASE',entityId:id,details:{from:record.status,to:updated.status,assignedToId:updated.assignedToId}}});return updated;
    });
    return NextResponse.json({message:result.status==='APPROVED'?'Recommendation approved. Perform any permitted intervention on the booking/account page, then record the resolution.':'Case updated.'});
  })(req);
}
