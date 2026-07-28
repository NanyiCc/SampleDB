import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { passwordHash } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,40}$/;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      username?: string;
      displayName?: string;
      password?: string;
      applicationNote?: string;
    };
    const username = body.username?.trim() ?? "";
    const displayName = body.displayName?.trim() ?? "";
    const password = body.password ?? "";
    const applicationNote = body.applicationNote?.trim() ?? "";

    if (!USERNAME_PATTERN.test(username)) {
      return NextResponse.json(
        { error: "用户名需为 3-40 位字母、数字、下划线、点或短横线。" },
        { status: 400 }
      );
    }

    if (!displayName || displayName.length > 80) {
      return NextResponse.json({ error: "请填写 1-80 个字符的显示名称。" }, { status: 400 });
    }

    if (password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: "密码长度需为 8-128 位。" }, { status: 400 });
    }

    if (applicationNote.length > 500) {
      return NextResponse.json({ error: "申请说明不能超过 500 个字符。" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: "该用户名已经存在，请联系管理员处理。" }, { status: 409 });
    }

    await prisma.user.create({
      data: {
        username,
        displayName,
        passwordHash: passwordHash(password),
        applicationNote: applicationNote || null,
        role: "USER",
        status: "PENDING"
      }
    });

    return NextResponse.json(
      { message: "注册申请已提交，请等待管理员审批。" },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "该用户名已经存在，请联系管理员处理。" }, { status: 409 });
    }

    console.error(error);
    return NextResponse.json({ error: "注册申请提交失败，请稍后重试。" }, { status: 500 });
  }
}
