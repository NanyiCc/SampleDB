import { NextRequest, NextResponse } from "next/server";
import { EXPERIMENT_CONFIG, normalizeProjectCode, SAMPLE_TYPES } from "@/lib/domain";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ensureAllHashCodes } from "@/lib/sample-identity";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectCode: string }> | { projectCode: string };
};

export async function GET(_request: NextRequest, context: RouteContext) {
  await ensureAllHashCodes();

  const params = await context.params;
  const projectCode = normalizeProjectCode(decodeURIComponent(params.projectCode));

  const project = await prisma.project.findUnique({
    where: {
      code: projectCode
    }
  });

  if (!project) {
    return jsonError("项目不存在。", 404);
  }

  const samples = await prisma.sample.findMany({
    where: {
      projectCode
    },
    include: {
      detail: true,
      batch: true
    },
    orderBy: {
      sequence: "asc"
    }
  });
  const sampleIds = samples.map((sample) => sample.id);
  const downstream = await prisma.derivedSample.findMany({
    where: {
      sourceSampleId: {
        in: sampleIds
      }
    },
    include: {
      result: true,
      entry: {
        include: {
          registration: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });
  const downstreamBySource = new Map<string, typeof downstream>();

  for (const item of downstream) {
    const list = downstreamBySource.get(item.sourceSampleId) ?? [];
    list.push(item);
    downstreamBySource.set(item.sourceSampleId, list);
  }

  return NextResponse.json({
    project,
    samples: samples.map((sample) => {
      const downstreamItems = downstreamBySource.get(sample.id) ?? [];
      return {
        ...sample,
        typeLabel: SAMPLE_TYPES[sample.type],
        downstreamCount: downstreamItems.length,
        submittedDownstreamCount: downstreamItems.filter((item) => item.result?.submittedAt).length,
        downstream: downstreamItems.map((item) => ({
          id: item.id,
          hashCode: item.hashCode,
          experimentType: item.experimentType,
          experimentLabel: EXPERIMENT_CONFIG[item.experimentType].label,
          createdAt: item.createdAt,
          submittedAt: item.result?.submittedAt ?? null,
          registrationId: item.entry?.registration.id ?? null
        }))
      };
    })
  });
}
