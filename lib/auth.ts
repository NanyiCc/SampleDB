import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const AUTH_COOKIE_NAME = "lab_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type AuthUser = {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
  status: string;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少环境变量 ${name}，请先配置鉴权参数。`);
  }
  return value;
}

function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) {
    return false;
  }

  try {
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function toAuthUser(user: {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
  status: string;
}): AuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status
  };
}

export async function ensureConfiguredAdmin() {
  const username = requiredEnv("AUTH_ADMIN_USERNAME");
  const password = requiredEnv("AUTH_ADMIN_PASSWORD");
  const displayName = process.env.AUTH_ADMIN_DISPLAY_NAME?.trim() || username;
  const now = new Date();

  return prisma.user.upsert({
    where: { username },
    create: {
      username,
      passwordHash: passwordHash(password),
      displayName,
      role: "ADMIN",
      status: "APPROVED",
      approvedAt: now
    },
    update: {
      passwordHash: passwordHash(password),
      displayName,
      role: "ADMIN",
      status: "APPROVED",
      rejectionReason: null,
      approvedAt: now
    }
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true }
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.user.status !== "APPROVED"
  ) {
    return null;
  }

  return toAuthUser(session.user);
}

export async function requireUser() {
  return getCurrentUser();
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.role === "ADMIN" && user.status === "APPROVED" ? user : null;
}

export function withAuth<TContext>(
  handler: (request: NextRequest, context: TContext) => Response | Promise<Response>
) {
  return async (request: NextRequest, context: TContext) => {
    if (!(await requireUser())) {
      return NextResponse.json({ error: "请先登录后再使用样本库管理系统。" }, { status: 401 });
    }
    return handler(request, context);
  };
}

export async function setSessionCookie(response: NextResponse, user: AuthUser) {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000)
    }
  });

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.AUTH_COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
}

export async function revokeCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return;
  }

  await prisma.session.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.AUTH_COOKIE_SECURE === "true",
    path: "/",
    maxAge: 0
  });
}

export { hashSessionToken, passwordHash };
