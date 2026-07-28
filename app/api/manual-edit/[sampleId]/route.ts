import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { EXPERIMENT_CONFIG, normalizeSampleId, SAMPLE_TYPES } from "@/lib/domain";
import { jsonError, toOptionalIntegerString, toOptionalNumber, toOptionalString } from "@/lib/http";
import { addStorageLocationToConfig } from "@/lib/lab-form-config";
import { prisma } from "@/lib/prisma";
import { ensureAllHashCodes, resolveSampleIdentity } from "@/lib/sample-identity";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sampleId: string }> | { sampleId: string };
};

type ManualEditBody = {
  sample?: {
    name?: string;
    type?: keyof typeof SAMPLE_TYPES;
    remark?: string;
    detail?: {
      volume?: unknown;
      concentration?: unknown;
      storageLocation?: string;
      tissueSource?: string;
      originalFragmentDistribution?: string;
    };
  };
  results?: Array<{
    derivedSampleId?: string;
    volume?: unknown;
    concentration?: unknown;
    storageLocation?: string;
    fragmentDistribution?: string;
    experimentMethod?: string;
    generationStrategy?: string;
    inputAmount?: unknown;
    outputVolume?: unknown;
    libraryDuration?: string;
    libraryStrategy?: string;
    absorbance260280?: unknown;
    absorbance260230?: unknown;
    barcode?: string;
    sliceCount?: unknown;
    sliceDetails?: string;
    chipId?: string;
    imageStorageLocation?: string;
    qc?: string;
    fragmentLength?: string;
    remark?: string;
  }>;
};

export const GET = withAuth(async (_request: NextRequest, context: RouteContext) => {
  await ensureAllHashCodes();

  const params = await context.params;
  const sampleId = await resolveInputToCanonicalId(decodeURIComponent(params.sampleId));
  const payload = await getManualEditPayload(sampleId);

  if (!payload) {
    return jsonError("没有找到该样本 ID。", 404);
  }

  return NextResponse.json(payload);
});

export const PATCH = withAuth(async (request: NextRequest, context: RouteContext) => {
  await ensureAllHashCodes();

  const params = await context.params;
  const sampleId = await resolveInputToCanonicalId(decodeURIComponent(params.sampleId));
  const body = (await request.json()) as ManualEditBody;
  const payload = await getManualEditPayload(sampleId);

  if (!payload) {
    return jsonError("没有找到该样本 ID。", 404);
  }

  try {
    await prisma.$transaction(async (tx) => {
    if (body.sample && payload.rootSample) {
      const type = body.sample.type && body.sample.type in SAMPLE_TYPES ? body.sample.type : payload.rootSample.type;
      const originalFragmentDistribution = toOptionalIntegerString(
        body.sample.detail?.originalFragmentDistribution
      );
      const storageLocation = toOptionalString(body.sample.detail?.storageLocation);

      if (body.sample.detail?.originalFragmentDistribution && originalFragmentDistribution === null) {
        throw new Error("INVALID_FRAGMENT_DISTRIBUTION");
      }

      await tx.sample.update({
        where: {
          id: payload.rootSample.id
        },
        data: {
          name: body.sample.name?.trim() ?? payload.rootSample.name,
          type,
          remark: toOptionalString(body.sample.remark),
          detail:
            type === "CDNA"
              ? {
                  upsert: {
                    create: {
                      volume: toOptionalNumber(body.sample.detail?.volume),
                      concentration: toOptionalNumber(body.sample.detail?.concentration),
                      storageLocation,
                      tissueSource: toOptionalString(body.sample.detail?.tissueSource),
                      originalFragmentDistribution
                    },
                    update: {
                      volume: toOptionalNumber(body.sample.detail?.volume),
                      concentration: toOptionalNumber(body.sample.detail?.concentration),
                      storageLocation,
                      tissueSource: toOptionalString(body.sample.detail?.tissueSource),
                      originalFragmentDistribution
                    }
                  }
                }
              : undefined
        }
      });
    }

    const allowedResultIds = new Set(payload.upstreamSteps.map((step) => step.id));
    for (const result of body.results ?? []) {
      const derivedSampleId = normalizeSampleId(result.derivedSampleId ?? "");
      if (!allowedResultIds.has(derivedSampleId)) {
        continue;
      }

      const step = payload.upstreamSteps.find((item) => item.id === derivedSampleId);
      if (!step) {
        continue;
      }

      const fragmentDistribution = toOptionalIntegerString(result.fragmentDistribution);
      if (result.fragmentDistribution && fragmentDistribution === null) {
        throw new Error("INVALID_FRAGMENT_DISTRIBUTION");
      }

      await tx.experimentResult.upsert({
        where: {
          derivedSampleId
        },
        create: {
          derivedSampleId,
          experimentType: step.experimentType,
          volume: toOptionalNumber(result.volume),
          concentration: toOptionalNumber(result.concentration),
          storageLocation: toOptionalString(result.storageLocation),
          fragmentDistribution,
          experimentMethod: toOptionalString(result.experimentMethod),
          generationStrategy: toOptionalString(result.generationStrategy),
          inputAmount: toOptionalNumber(result.inputAmount),
          outputVolume: toOptionalNumber(result.outputVolume),
          libraryDuration: toOptionalString(result.libraryDuration),
          libraryStrategy: toOptionalString(result.libraryStrategy),
          absorbance260280: toOptionalNumber(result.absorbance260280),
          absorbance260230: toOptionalNumber(result.absorbance260230),
          barcode: toOptionalString(result.barcode),
          sliceCount: toOptionalInteger(result.sliceCount),
          sliceDetails: toOptionalString(result.sliceDetails),
          chipId: toOptionalString(result.chipId),
          imageStorageLocation: toOptionalString(result.imageStorageLocation),
          qc: toOptionalString(result.qc),
          fragmentLength: toOptionalIntegerString(result.fragmentLength),
          remark: toOptionalString(result.remark),
          submittedAt: step.result?.submittedAt ?? new Date()
        },
        update: {
          volume: toOptionalNumber(result.volume),
          concentration: toOptionalNumber(result.concentration),
          storageLocation: toOptionalString(result.storageLocation),
          fragmentDistribution,
          experimentMethod: toOptionalString(result.experimentMethod),
          generationStrategy: toOptionalString(result.generationStrategy),
          inputAmount: toOptionalNumber(result.inputAmount),
          outputVolume: toOptionalNumber(result.outputVolume),
          libraryDuration: toOptionalString(result.libraryDuration),
          libraryStrategy: toOptionalString(result.libraryStrategy),
          absorbance260280: toOptionalNumber(result.absorbance260280),
          absorbance260230: toOptionalNumber(result.absorbance260230),
          barcode: toOptionalString(result.barcode),
          sliceCount: toOptionalInteger(result.sliceCount),
          sliceDetails: toOptionalString(result.sliceDetails),
          chipId: toOptionalString(result.chipId),
          imageStorageLocation: toOptionalString(result.imageStorageLocation),
          qc: toOptionalString(result.qc),
          fragmentLength: toOptionalIntegerString(result.fragmentLength),
          remark: toOptionalString(result.remark)
        }
      });
    }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_FRAGMENT_DISTRIBUTION") {
      return jsonError("片段均值必须填写整数 bp。");
    }

    throw error;
  }

  await Promise.all([
    addStorageLocationToConfig(toOptionalString(body.sample?.detail?.storageLocation)),
    ...Array.from(
      new Set((body.results ?? []).map((result) => toOptionalString(result.storageLocation)).filter(Boolean))
    ).map(addStorageLocationToConfig)
  ]);

  const updatedPayload = await getManualEditPayload(sampleId);
  return NextResponse.json(updatedPayload);
});

async function resolveInputToCanonicalId(input: string) {
  const normalized = normalizeSampleId(input);
  const identity = await resolveSampleIdentity(prisma, normalized);
  return identity?.id ?? normalized;
}

function toOptionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? numberValue : null;
}

async function getManualEditPayload(sampleId: string) {
  if (!sampleId) {
    return null;
  }

  const currentBaseSample = await prisma.sample.findUnique({
    where: { id: sampleId },
    include: { detail: true, batch: true }
  });
  const currentDerivedSample = await prisma.derivedSample.findUnique({
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

  if (!currentBaseSample && !currentDerivedSample) {
    return null;
  }

  const reversedSteps = [];
  const seen = new Set<string>();
  let cursor = sampleId;
  let rootSample = currentBaseSample;

  while (!rootSample && !seen.has(cursor)) {
    seen.add(cursor);
    const step = await prisma.derivedSample.findUnique({
      where: { id: cursor },
      include: {
        result: true,
        entry: {
          include: {
            registration: true
          }
        }
      }
    });

    if (!step) {
      break;
    }

    reversedSteps.push(step);
    cursor = step.sourceSampleId;
    rootSample = await prisma.sample.findUnique({
      where: { id: cursor },
      include: { detail: true, batch: true }
    });
  }

  const upstreamSteps = reversedSteps.reverse();

  return {
    query: sampleId,
    current: currentBaseSample
      ? { kind: "BASE_SAMPLE", sample: currentBaseSample }
      : { kind: "DERIVED_SAMPLE", sample: currentDerivedSample },
    rootSample,
    upstreamSteps: upstreamSteps.map((step) => ({
      ...step,
      label: EXPERIMENT_CONFIG[step.experimentType].label
    }))
  };
}
