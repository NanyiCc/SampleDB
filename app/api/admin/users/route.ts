import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "只有管理员可以管理用户。" }, { status: 403 });
  }

  const requestedStatus = request.nextUrl.searchParams.get("status")?.toUpperCase();
  const users = await prisma.user.findMany({
    where: requestedStatus ? { status: requestedStatus } : undefined,
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
      updatedAt: true,
      approvedBy: {
        select: {
          username: true,
          displayName: true
        }
      }
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }]
  });

  return NextResponse.json({ users });
}
