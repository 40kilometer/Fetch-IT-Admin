import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {staffRoute,text} from '@/lib/staff-http';
export const POST=staffRoute(undefined,async(req,staff)=>{const body=await req.json();await db.staffSession.updateMany({where:{userId:staff.id,id:text(body.id,100)},data:{revokedAt:new Date()}});return NextResponse.json({message:'Session revoked.'});});
