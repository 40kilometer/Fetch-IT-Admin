import { NextRequest, NextResponse } from "next/server";
import { clearAdminSessionCookie, getAdminSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function POST(req:NextRequest) {
  if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'This request is not allowed.'},{status:403});
  const session=await getAdminSession();
  if(session?.sid) await db.staffSession.updateMany({where:{id:session.sid,userId:session.uid},data:{revokedAt:new Date()}});
  await clearAdminSessionCookie();
  return NextResponse.json({ ok: true });
}
