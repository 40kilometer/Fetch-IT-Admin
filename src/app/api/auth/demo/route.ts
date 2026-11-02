import { NextResponse } from "next/server";
import { withRequestLog } from "@/lib/request-guard";

async function handle() {
  return NextResponse.json({ error: "Staff switching is no longer available. Sign out and sign in with your staff email and password." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
export const GET = withRequestLog("admin:demo:GET", handle);
export const POST = withRequestLog("admin:demo:POST", handle);
export const DELETE = withRequestLog("admin:demo:DELETE", handle);
