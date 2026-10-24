import { NextRequest } from "next/server";
import { staffRoute } from "@/lib/staff-http";
import { staffApplicationRequest } from "@/lib/application-staff-api";
export const runtime = "nodejs";
async function handle(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 return staffRoute("safety", (request, staff) => staffApplicationRequest(request, staff, id))(req);
}
export const GET = handle;
export const POST = handle;
