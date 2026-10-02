import { NextRequest, NextResponse } from "next/server";
import {
  ensureConfiguredAdmin,
  setSessionCookie,
  toAuthUser,
  verifyPassword
} from "@/lib/auth";
import { readStoredAdminCredential } from "@/lib/admin-credentials";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";

    if (!username || !password) {
      return NextResponse.json({ error: "请输入用户名和密码。" }, { status: 400 });
    }

    const configuredAdmin = await readStoredAdminCredential();
    if (!configuredAdmin) {
      return NextResponse.json(
        { error: "系统尚未初始化管理员账号。请在服务器终端启动项目以完成设置。" },
        { status: 503 }
      );
    }
    const isConfiguredAdmin = username === configuredAdmin?.username;
    const user = isConfiguredAdmin
      ? await ensureConfiguredAdmin(configuredAdmin)
      : await prisma.user.findUnique({ where: { username } });

    if (user?.role === "ADMIN" && !isConfiguredAdmin) {
      return NextResponse.json({ error: "用户名或密码错误。" }, { status: 401 });
    }

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "用户名或密码错误。" }, { status: 401 });
    }

    if (user.status === "PENDING") {
      return NextResponse.json({ error: "账号正在等待管理员审批。" }, { status: 403 });
    }

    if (user.status === "REJECTED") {
      return NextResponse.json(
        { error: user.rejectionReason ? `注册申请未通过：${user.rejectionReason}` : "注册申请未通过。" },
        { status: 403 }
      );
    }

    if (user.status === "DISABLED") {
      return NextResponse.json({ error: "账号已被停用，请联系管理员。" }, { status: 403 });
    }

    const response = NextResponse.json({ user: toAuthUser(user) });
    await setSessionCookie(response, toAuthUser(user));
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "登录服务尚未完成配置，请检查独立管理员凭据。" }, { status: 500 });
  }
}
