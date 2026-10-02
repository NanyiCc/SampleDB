import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { EXPERIMENT_CONFIG, normalizeSampleId, SAMPLE_TYPES } from "@/lib/domain";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ensureAllHashCodes } from "@/lib/sample-identity";

export const runtime = "nodejs";

export const GET = withAuth(async (request: NextRequest) => {
  await ensureAllHashCodes();

  const query = normalizeSampleId(request.nextUrl.searchParams.get("q") ?? "");

  if (!query) {
    return jsonError("请输入查询文本。");
  }

  const [samples, derivedSamples] = await Promise.all([
    prisma.sample.findMany({
      where: {
        OR: [
          {
            id: {
              contains: query
            }
          },
          {
            hashCode: {
              contains: query
            }
          },
          {
            tubeId: {
              contains: query
            }
          }
        ]
      },
      include: {
        detail: true
      },
      orderBy: {
        storedAt: "desc"
      },
      take: 30
    }),
    prisma.derivedSample.findMany({
      where: {
        OR: [
          {
            id: {
              contains: query
            }
          },
          {
            hashCode: {
              contains: query
            }
          }
        ]
      },
      include: {
        result: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 30
    })
  ]);

  return NextResponse.json({
    samples: [
      ...samples.map((sample) => ({
        id: sample.id,
        hashCode: sample.hashCode,
        tubeId: sample.tubeId,
        kind: "BASE_SAMPLE",
        label: SAMPLE_TYPES[sample.type],
        createdAt: sample.storedAt
      })),
      ...derivedSamples.map((sample) => ({
        id: sample.id,
        hashCode: sample.hashCode,
        kind: "DERIVED_SAMPLE",
        label: EXPERIMENT_CONFIG[sample.experimentType].label,
        createdAt: sample.createdAt,
        submittedAt: sample.result?.submittedAt ?? null
      }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  });
});
