import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { EXPERIMENT_CONFIG, SAMPLE_TYPES, normalizeSampleId } from "@/lib/domain";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ensureAllHashCodes, resolveSampleIdentity } from "@/lib/sample-identity";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sampleId: string }> | { sampleId: string };
};

export const GET = withAuth(async (_request: NextRequest, context: RouteContext) => {
  await ensureAllHashCodes();

  const params = await context.params;
  const requestedId = normalizeSampleId(decodeURIComponent(params.sampleId));
  const identity = await resolveSampleIdentity(prisma, requestedId);
  const sampleId = identity?.id ?? requestedId;

  if (!sampleId) {
    return jsonError("请输入样本 ID。");
  }

  const baseSample = await prisma.sample.findUnique({
    where: { id: sampleId },
    include: {
      detail: true,
      batch: true
    }
  });

  const derivedSample = await prisma.derivedSample.findUnique({
    where: { id: sampleId },
    include: {
      result: true,
      entry: {
        include: {
          registration: true
        }
      }
    }
  });

  if (!baseSample && !derivedSample) {
    return jsonError("没有找到该样本 ID。", 404);
  }

  const upstream = await buildUpstream(sampleId);
  const rootSample = upstream.rootSample ?? baseSample;
  const downstream = await getDirectDerivedSteps(sampleId, "desc");
  const sequencingRegistrations = await prisma.samplingRegistration.findMany({
    where: {
      experimentType: "SEQUENCING",
      entries: {
        some: {
          sourceSampleId: sampleId
        }
      }
    },
    include: {
      entries: {
        include: {
          derivedSample: {
            include: {
              result: true
            }
          }
        },
        orderBy: {
          id: "asc"
        }
      },
      sequencingResult: true
    },
    orderBy: {
      registeredAt: "desc"
    }
  });

  return NextResponse.json({
    query: sampleId,
    requestedQuery: requestedId,
    kind: baseSample ? "BASE_SAMPLE" : "DERIVED_SAMPLE",
    current: baseSample
      ? {
          id: baseSample.id,
          hashCode: baseSample.hashCode,
          name: baseSample.name,
          type: SAMPLE_TYPES[baseSample.type],
          projectCode: baseSample.projectCode,
          receivedAt: baseSample.receivedAt,
          storedAt: baseSample.storedAt,
          remark: baseSample.remark,
          detail: baseSample.detail,
          batch: baseSample.batch
        }
      : {
          id: derivedSample?.id,
          hashCode: derivedSample?.hashCode,
          sourceSampleId: derivedSample?.sourceSampleId,
          experimentType: derivedSample ? EXPERIMENT_CONFIG[derivedSample.experimentType].label : "",
          createdAt: derivedSample?.createdAt,
          result: derivedSample?.result,
          registration: derivedSample?.entry?.registration ?? null,
          inputAmountNg: derivedSample?.entry?.inputAmountNg ?? null
        },
    rootSample,
    upstream: upstream.items,
    relatedSteps: upstream.steps,
    downstream: downstream.map(formatStep),
    sequencingRegistrations
  });
});

async function getDerivedStep(id: string) {
  return prisma.derivedSample.findUnique({
    where: { id },
    include: {
      result: true,
      entry: {
        include: {
          registration: true
        }
      }
    }
  });
}

async function getDirectDerivedSteps(sourceSampleId: string, direction: "asc" | "desc") {
  return prisma.derivedSample.findMany({
    where: {
      sourceSampleId
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
      createdAt: direction
    }
  });
}

async function buildUpstream(sampleId: string) {
  const items: Array<Record<string, unknown>> = [];
  const reversedSteps = [];
  const seen = new Set<string>();
  let cursor = sampleId;
  let rootSample = await prisma.sample.findUnique({
    where: { id: cursor },
    include: {
      detail: true,
      batch: true
    }
  });

  while (!rootSample && !seen.has(cursor)) {
    seen.add(cursor);
    const step = await getDerivedStep(cursor);
    if (!step) {
      break;
    }
    reversedSteps.push(step);
    cursor = step.sourceSampleId;
    rootSample = await prisma.sample.findUnique({
      where: { id: cursor },
      include: {
        detail: true,
        batch: true
      }
    });
  }

  if (rootSample) {
    items.push({
      type: "source",
      title: "原始入库样本",
      sample: rootSample
    });
  }

  const steps = reversedSteps.reverse();
  for (const step of steps) {
    items.push({
      type: "experiment",
      title: EXPERIMENT_CONFIG[step.experimentType].label,
      derivedSample: step,
      registration: step.entry?.registration ?? null
    });
  }

  return {
    rootSample,
    items,
    steps: steps.map(formatStep)
  };
}

function formatStep(step: Awaited<ReturnType<typeof getDerivedStep>> extends infer T ? NonNullable<T> : never) {
  return {
    id: step.id,
    hashCode: step.hashCode,
    sourceSampleId: step.sourceSampleId,
    experimentType: EXPERIMENT_CONFIG[step.experimentType].label,
    createdAt: step.createdAt,
    result: step.result,
    registration: step.entry?.registration ?? null,
    inputAmountNg: step.entry?.inputAmountNg ?? null
  };
}
