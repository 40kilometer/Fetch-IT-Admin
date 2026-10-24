import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {staffRoute,StaffError,text} from '@/lib/staff-http';
import {hasPermission} from '@/lib/staff-policy';
export const POST=staffRoute('resources.edit',async(req,staff)=>{
  const body=await req.json();const allowed=hasPermission(staff.role,'operations')?['KNOWLEDGE','TEMPLATE','ANNOUNCEMENT','SAFETY_GUIDE']:['KNOWLEDGE','TEMPLATE'];
  if(!allowed.includes(body.kind))throw new StaffError('You cannot publish this resource.',403);
  const record=await db.$transaction(async tx=>{
    const saved=await tx.staffResource.create({data:{kind:body.kind,title:text(body.title,160),body:text(body.body,4000),updatedById:staff.id}});
    await tx.adminAudit.create({data:{actorId:staff.id,actorName:staff.name,action:'RESOURCE_PUBLISHED',entityType:'RESOURCE',entityId:saved.id,details:{kind:saved.kind,title:saved.title}}});return saved;
  });return NextResponse.json({message:`Published ${record.title}.`},{status:201});
});
