import { NextRequest } from "next/server";
import { adminPasswordReset } from "@/lib/admin-password-reset";
import { withRequestLog } from "@/lib/request-guard";
export const POST = withRequestLog("admin:send-reset:POST", (req: NextRequest) => adminPasswordReset(req, "send"));
