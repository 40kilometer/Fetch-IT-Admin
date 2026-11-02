import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {staffRoute,StaffError} from '@/lib/staff-http';
import {safetyCaseContact} from '@/lib/safety-case-actions';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  return staffRoute('safety',async(request,staff)=>{
    const body=await request.json();
    if(!['contacts','call-start'].includes(body.action))throw new StaffError('Choose a contact action.');
    const result=await db.$transaction(tx=>safetyCaseContact(tx,id,staff,body),{timeout:20000});
    return NextResponse.json(result);
  })(req);
}
