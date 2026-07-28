import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { normalizeProjectCode } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { ensureAllHashCodes } from "@/lib/sample-identity";

export const runtime = "nodejs";

export const GET = withAuth(async (request: NextRequest) => {
  await ensureAllHashCodes();

  const query = normalizeProjectCode(request.nextUrl.searchParams.get("q") ?? "");
  const projects = await prisma.project.findMany({
    where: query
      ? {
          code: {
            contains: query
          }
        }
      : undefined,
    include: {
      _count: {
        select: {
          samples: true,
          batches: true
        }
      }
    },
    orderBy: {
      code: "asc"
    },
    take: 100
  });

  return NextResponse.json({
    projects: projects.map((project) => ({
      code: project.code,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      sampleCount: project._count.samples,
      batchCount: project._count.batches
    }))
  });
});
