import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {staffRoute,StaffError,text} from '@/lib/staff-http';
import {hasPermission} from '@/lib/staff-policy';
import {teamBySlug,teamForRole} from '@/lib/staff-teams';
export const POST=staffRoute('resources.edit',async(req,staff)=>{
  const body=await req.json();const allowed=hasPermission(staff.role,'operations')?['KNOWLEDGE','TEMPLATE','ANNOUNCEMENT','SAFETY_GUIDE']:['KNOWLEDGE','TEMPLATE'];
  const ownTeam=teamForRole(staff.role),team=ownTeam??teamBySlug(body.team);
  if(body.team&&(!team||team.slug!==body.team))throw new StaffError('Choose an accessible team.',403);
  if(!allowed.includes(body.kind))throw new StaffError('You cannot publish this resource.',403);
  if(team&&!team.resourceKinds.includes(body.kind))throw new StaffError('Choose a resource type for this team.',403);
  const record=await db.$transaction(async tx=>{
    const saved=await tx.staffResource.create({data:{kind:body.kind,title:text(body.title,160),body:text(body.body,4000),updatedById:staff.id}});
    await tx.adminAudit.create({data:{actorId:staff.id,actorName:staff.name,action:'RESOURCE_PUBLISHED',entityType:'RESOURCE',entityId:saved.id,details:{kind:saved.kind,title:saved.title,...(team?{team:team.slug}:{})}}});return saved;
  });return NextResponse.json({message:`Published ${record.title}.`},{status:201});
});
