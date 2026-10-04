import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentAdmin } from "@/lib/admin-access";
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await currentAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => null);
    if (!body || !["ban", "unban"].includes(body.action)) return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    if (body.action === "ban" && (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 500)) return NextResponse.json({ error: "Add a restriction reason of up to 500 characters." }, { status: 400 });
    const { id } = await params;
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (target.role === "ADMIN") return NextResponse.json({ error: "Admin accounts can’t be restricted here." }, { status: 403 });
    const banned = body.action === "ban";
    const result = await db.$transaction(async tx => {
      const changed = await tx.user.updateMany({ where: { id, role: { in: ["CUSTOMER", "RIDER"] }, isBanned: !banned }, data: { isBanned: banned, banReason: banned ? body.reason.trim() : null, bannedAt: banned ? new Date() : null } });
      if (!changed.count) return null;
      await tx.adminAudit.create({ data: { actorId: admin.id, actorName: admin.name, action: banned ? "USER_RESTRICTED" : "USER_RESTORED", entityType: "USER", entityId: id, details: { reason: banned ? body.reason.trim() : "Restriction lifted", previousReason: target.banReason } } });
      return tx.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, isBanned: true, banReason: true, bannedAt: true } });
    });
    return result ? NextResponse.json({ user: result }) : NextResponse.json({ error: "The account was already changed. Refresh and try again." }, { status: 409 });
  } catch { return NextResponse.json({ error: "Couldn’t update the account. Please retry." }, { status: 503 }); }
}
