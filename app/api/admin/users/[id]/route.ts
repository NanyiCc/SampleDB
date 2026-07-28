import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };
type Action = "approve" | "reject" | "disable" | "enable";

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "只有管理员可以管理用户。" }, { status: 403 });
  }

  const params = await context.params;
  const userId = Number(params.id);
  const body = (await request.json()) as { action?: Action; rejectionReason?: string };
  const action = body.action;

  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "用户 ID 无效。" }, { status: 400 });
  }

  if (!action || !["approve", "reject", "disable", "enable"].includes(action)) {
    return NextResponse.json({ error: "无效的用户管理操作。" }, { status: 400 });
  }

  if (userId === admin.id && (action === "disable" || action === "reject")) {
    return NextResponse.json({ error: "不能停用或拒绝当前管理员账号。" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: "用户不存在。" }, { status: 404 });
  }

  const rejectionReason = body.rejectionReason?.trim() ?? "";
  if (action === "reject" && rejectionReason.length > 200) {
    return NextResponse.json({ error: "拒绝原因不能超过 200 个字符。" }, { status: 400 });
  }

  const nextStatus = {
    approve: "APPROVED",
    reject: "REJECTED",
    disable: "DISABLED",
    enable: "APPROVED"
  }[action];

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      status: nextStatus,
      approvedAt: action === "approve" || action === "enable" ? new Date() : target.approvedAt,
      approvedById: action === "approve" || action === "enable" ? admin.id : target.approvedById,
      rejectionReason: action === "reject" ? rejectionReason || null : null
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      status: true,
      applicationNote: true,
      rejectionReason: true,
      approvedAt: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (action === "reject" || action === "disable") {
    await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  return NextResponse.json({ user });
}
