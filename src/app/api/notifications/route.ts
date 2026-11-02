import {NextRequest,NextResponse} from 'next/server';
import {currentStaff} from '@/lib/staff-access';
import {db} from '@/lib/db';
import {notificationFeed,noticeView,readNotifications,refreshOperationalSignals} from '@/lib/staff-notifications';
export async function GET(req:NextRequest){
 try{
  const staff=await currentStaff();if(!staff)return NextResponse.json({error:'Sign in with an active staff account.'},{status:401});
  await refreshOperationalSignals(db);
  return NextResponse.json(await notificationFeed(db,staff,noticeView(req.nextUrl.searchParams.get('view'),staff.role),req.nextUrl.searchParams.get('before')??undefined),{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'Notifications are unavailable. Please retry.'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
}
export async function PATCH(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')return NextResponse.json({error:'This request is not allowed.'},{status:403});
 try{
  const staff=await currentStaff();if(!staff)return NextResponse.json({error:'Sign in again before marking notifications as read.'},{status:401});
  const body=await req.json();
  const result=await readNotifications(db,staff,noticeView(body.view,staff.role),body.ids);
  return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error&&/notifications|Choose up to/.test(error.message)?error.message:'Could not save read status. Please retry.'},{status:400});}
}
