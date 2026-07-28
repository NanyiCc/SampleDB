import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { EXPERIMENT_CONFIG } from "@/lib/domain";
import { jsonError, toOptionalIntegerString, toOptionalNumber, toOptionalString } from "@/lib/http";
import { addStorageLocationToConfig } from "@/lib/lab-form-config";
import { prisma } from "@/lib/prisma";
import { ensureAllHashCodes, resolveSampleIdentity } from "@/lib/sample-identity";

export const runtime = "nodejs";

type ResultBody = {
  mode?: "draft" | "submit";
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
};

type RouteContext = {
  params: Promise<{ derivedSampleId: string }> | { derivedSampleId: string };
};

export const POST = withAuth(async (request: NextRequest, context: RouteContext) => {
  await ensureAllHashCodes();

  const params = await context.params;
  const identity = await resolveSampleIdentity(prisma, decodeURIComponent(params.derivedSampleId));
  const derivedSampleId = identity?.kind === "DERIVED_SAMPLE" ? identity.id : decodeURIComponent(params.derivedSampleId);
  const body = (await request.json()) as ResultBody;
  const mode = body.mode === "draft" ? "draft" : "submit";

  const derivedSample = await prisma.derivedSample.findUnique({
    where: {
      id: derivedSampleId
    }
  });

  if (!derivedSample) {
    return jsonError("派生样本不存在。", 404);
  }

  if (!(derivedSample.experimentType in EXPERIMENT_CONFIG)) {
    return jsonError("派生样本实验类型无效。", 400);
  }

  const existingResult = await prisma.experimentResult.findUnique({
    where: {
      derivedSampleId
    }
  });

  if (existingResult?.submittedAt) {
    return jsonError("该实验结果已经提交，不能继续修改。", 409);
  }

  const fragmentDistribution = toOptionalIntegerString(body.fragmentDistribution);
  if (body.fragmentDistribution && fragmentDistribution === null) {
    return jsonError("片段均值必须填写整数 bp。");
  }

  const sliceValidation = validateTissueSectionPayload(body, derivedSample.experimentType, mode);
  if (sliceValidation) {
    return jsonError(sliceValidation);
  }

  if (mode === "submit" && derivedSample.experimentType === "SECTION_PLACEMENT" && !toOptionalString(body.chipId)) {
    return jsonError("实贴片结果需要填写芯片 ID。");
  }

  if (mode === "submit" && derivedSample.experimentType === "CDNA_PREP") {
    if (toOptionalNumber(body.volume) === null) {
      return jsonError("制取cDNA结果需要填写体积。");
    }
    if (toOptionalNumber(body.concentration) === null) {
      return jsonError("制取cDNA结果需要填写浓度。");
    }
    if (!toOptionalIntegerString(body.fragmentLength)) {
      return jsonError("制取cDNA结果需要填写整数片段长度 bp。");
    }
  }

  const data = {
    experimentType: derivedSample.experimentType,
    volume: toOptionalNumber(body.volume),
    concentration: toOptionalNumber(body.concentration),
    storageLocation: toOptionalString(body.storageLocation),
    fragmentDistribution,
    experimentMethod: toOptionalString(body.experimentMethod),
    generationStrategy: toOptionalString(body.generationStrategy),
    inputAmount: toOptionalNumber(body.inputAmount),
    outputVolume: toOptionalNumber(body.outputVolume),
    libraryDuration: toOptionalString(body.libraryDuration),
    libraryStrategy: toOptionalString(body.libraryStrategy),
    absorbance260280: toOptionalNumber(body.absorbance260280),
    absorbance260230: toOptionalNumber(body.absorbance260230),
    barcode: toOptionalString(body.barcode),
    sliceCount: toOptionalInteger(body.sliceCount),
    sliceDetails: toOptionalString(body.sliceDetails),
    chipId: toOptionalString(body.chipId),
    imageStorageLocation: toOptionalString(body.imageStorageLocation),
    qc: toOptionalString(body.qc),
    fragmentLength: toOptionalIntegerString(body.fragmentLength),
    remark: toOptionalString(body.remark),
    submittedAt: mode === "submit" ? new Date() : null
  };

  const result = await prisma.experimentResult.upsert({
    where: {
      derivedSampleId
    },
    create: {
      derivedSampleId,
      ...data
    },
    update: data
  });

  await addStorageLocationToConfig(data.storageLocation);

  return NextResponse.json({ result });
});

export const DELETE = withAuth(async (_request: NextRequest, context: RouteContext) => {
  await ensureAllHashCodes();

  const params = await context.params;
  const identity = await resolveSampleIdentity(prisma, decodeURIComponent(params.derivedSampleId));
  const derivedSampleId = identity?.kind === "DERIVED_SAMPLE" ? identity.id : decodeURIComponent(params.derivedSampleId);

  const derivedSample = await prisma.derivedSample.findUnique({
    where: {
      id: derivedSampleId
    },
    include: {
      result: true
    }
  });

  if (!derivedSample) {
    return jsonError("派生样本不存在。", 404);
  }

  if (derivedSample.result?.submittedAt) {
    return jsonError("已提交的实验结果不能删除。", 409);
  }

  await prisma.derivedSample.delete({
    where: {
      id: derivedSampleId
    }
  });

  return NextResponse.json({ ok: true });
});

function toOptionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? numberValue : null;
}

function validateTissueSectionPayload(body: ResultBody, experimentType: string, mode: "draft" | "submit") {
  if (experimentType !== "TISSUE_SECTION") {
    return null;
  }

  const sliceCount = toOptionalInteger(body.sliceCount);
  if (mode === "submit" && (!sliceCount || sliceCount < 1)) {
    return "组织切片结果需要填写切片张数。";
  }

  if (!body.sliceDetails) {
    return mode === "submit" ? "组织切片结果需要填写每张切片信息。" : null;
  }

  let slices: Array<{ knifeCount?: unknown; thickness?: unknown }>;
  try {
    slices = JSON.parse(body.sliceDetails) as Array<{ knifeCount?: unknown; thickness?: unknown }>;
  } catch {
    return "组织切片明细格式无效。";
  }

  if (!Array.isArray(slices)) {
    return "组织切片明细格式无效。";
  }

  if (mode === "submit" && sliceCount && slices.length !== sliceCount) {
    return "组织切片张数与明细行数不一致。";
  }

  if (mode === "submit") {
    for (const [index, slice] of slices.entries()) {
      if (toOptionalInteger(slice.knifeCount) === null) {
        return `第 ${index + 1} 张切片需要填写切片刀数。`;
      }
      if (toOptionalNumber(slice.thickness) === null) {
        return `第 ${index + 1} 张切片需要填写切片厚度。`;
      }
    }
  }

  return null;
}
