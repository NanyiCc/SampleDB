import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readStoredAdminCredential, type StoredAdminCredential } from "@/lib/admin-credentials";
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

export function passwordHash(password: string) {
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

export async function ensureConfiguredAdmin(credential?: StoredAdminCredential) {
  const configuredAdmin = credential ?? (await readStoredAdminCredential());
  if (!configuredAdmin) {
    throw new Error("未找到独立管理员凭据。请先通过 npm run portable:start 或 npm run dev 初始化管理员账号。");
  }

  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    await transaction.user.updateMany({
      where: {
        role: "ADMIN",
        username: { not: configuredAdmin.username }
      },
      data: { status: "DISABLED" }
    });

    return transaction.user.upsert({
      where: { username: configuredAdmin.username },
      create: {
        username: configuredAdmin.username,
        passwordHash: configuredAdmin.passwordHash,
        displayName: configuredAdmin.displayName,
        role: "ADMIN",
        status: "APPROVED",
        approvedAt: now
      },
      update: {
        passwordHash: configuredAdmin.passwordHash,
        displayName: configuredAdmin.displayName,
        role: "ADMIN",
        status: "APPROVED",
        rejectionReason: null,
        approvedAt: now
      }
    });
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

  if (session.user.role === "ADMIN") {
    const configuredAdmin = await readStoredAdminCredential();
    if (configuredAdmin?.username !== session.user.username) {
      return null;
    }
  }

  return toAuthUser(session.user);
}

export async function requireUser() {
  return getCurrentUser();
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN" || user.status !== "APPROVED") {
    return null;
  }
  const configuredAdmin = await readStoredAdminCredential();
  return configuredAdmin?.username === user.username ? user : null;
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

export { hashSessionToken };
