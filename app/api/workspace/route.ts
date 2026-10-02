import { NextResponse } from "next/server";
import { getCurrentUser, withAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const GET = withAuth(async () => {
  const [samples, registrations, user] = await Promise.all([
    prisma.sample.findMany({
      include: { detail: true },
      orderBy: { id: "asc" },
    }),
    prisma.samplingRegistration.findMany({
      include: {
        entries: { include: { derivedSample: { include: { result: true } } } },
        sequencingResult: true,
      },
      orderBy: { registeredAt: "asc" },
    }),
    getCurrentUser(),
  ]);
  return NextResponse.json(
    { samples, registrations, user },
    { headers: { "Cache-Control": "no-store" } },
  );
});
