import { NextRequest, NextResponse } from "next/server";
import { clearAdminSessionCookie, getAdminSession } from "@/lib/session";
import { db } from "@/lib/db";
import { clearDemoCookie, revokeDemoSessions } from "@/lib/staff-demo";

export async function POST(req:NextRequest) {
  if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'This request is not allowed.'},{status:403});
  const session=await getAdminSession();
  try {
    await db.$transaction(async tx=>{
      await revokeDemoSessions(tx,session);
      if(session?.sid) await tx.staffSession.updateMany({where:{id:session.sid,userId:session.uid},data:{revokedAt:new Date()}});
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ signedOut: true, error: "Signed out on this browser. Server session cleanup could not be confirmed." }, { status: 503 });
  } finally {
    await clearDemoCookie();
    await clearAdminSessionCookie();
  }
}
