import { staffRoute } from "@/lib/staff-http";
import { staffApplicationRequest } from "@/lib/application-staff-api";
export const runtime = "nodejs";
export const GET = staffRoute("safety", (req, staff) => staffApplicationRequest(req, staff));
