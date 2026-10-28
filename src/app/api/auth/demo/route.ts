import { NextRequest, NextResponse } from "next/server";
import { withRequestLog, safeErrorCode } from "@/lib/request-guard";
import { DemoAccessError, demoStatus, finishDemo, switchDemoRole } from "@/lib/staff-demo";

async function handle(req: NextRequest) {
  if (req.method !== "GET" && (req.headers.get("origin") !== req.nextUrl.origin || req.headers.get("sec-fetch-site") === "cross-site")) return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });
  try {
    if (req.method === "GET") return NextResponse.json(await demoStatus());
    if (req.method === "DELETE") return NextResponse.json(await finishDemo());
    const body = await req.json().catch(() => null);
    return NextResponse.json(await switchDemoRole(body?.role));
  } catch (error) {
    if (error instanceof DemoAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[staff demo] error", { code: safeErrorCode(error) });
    return NextResponse.json({ error: "Demo access is temporarily unavailable. Please retry." }, { status: 503 });
  }
}
export const GET = withRequestLog("admin:demo:GET", handle);
export const POST = withRequestLog("admin:demo:POST", handle);
export const DELETE = withRequestLog("admin:demo:DELETE", handle);
