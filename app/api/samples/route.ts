import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, withAuth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import {
  CELL_PRESERVATION_MEDIUM_OPTIONS,
  FRESH_BLOOD_STATUS_OPTIONS,
  PROJECT_CODE_PATTERN,
  PROJECT_CODE_RULE_TEXT,
  SAMPLE_CHECKER_OPTIONS,
  STORAGE_CONDITION_OPTIONS,
  formatSampleId,
  isBloodTubeSampleType,
  normalizeProjectCode,
  normalizeSampleId,
  SAMPLE_TYPES
} from "@/lib/domain";
import { jsonError, toOptionalIntegerString, toOptionalNumber, toOptionalString } from "@/lib/http";
import { addStorageLocationToConfig } from "@/lib/lab-form-config";
import { prisma } from "@/lib/prisma";
import { ensureAllHashCodes, generateUniqueHashCode } from "@/lib/sample-identity";

export const runtime = "nodejs";

type CreateSamplesBody = {
  projectCode?: string;
  name?: string;
  tubeId?: string;
  createdBy?: string;
  receivedAt?: string;
  type?: keyof typeof SAMPLE_TYPES;
  remark?: string;
  count?: number;
  detail?: {
    volume?: unknown;
    concentration?: unknown;
    storageLocation?: string;
    tissueSource?: string;
    technologyType?: string;
    originalFragmentDistribution?: string;
    experimentMethod?: string;
    loadingVolume?: unknown;
    remark?: string;
    tubeRecordName?: string;
    freshBloodStatus?: string;
    frozenWholeBloodTubeCount?: unknown;
    frozenPlasmaTubeCount?: unknown;
    frozenCellTubeCount?: unknown;
    qualityControlCellCount?: string;
    storageCondition?: string;
    preservationMedium?: string;
    experimentDate?: string;
    experimentLocation?: string;
    experimenter?: string;
    checker?: string;
    patientGroup?: string;
    projectTeacher?: string;
  };
  samples?: Array<{
    id?: string;
    projectCode?: string;
    name?: string;
    tubeId?: string;
    receivedAt?: string;
    type?: keyof typeof SAMPLE_TYPES;
    remark?: string;
    detail?: CreateSamplesBody["detail"];
  }>;
};

export const GET = withAuth(async () => {
  await ensureAllHashCodes();

  const samples = await prisma.sample.findMany({
    include: {
      detail: true,
      batch: true
    },
    orderBy: [
      {
        storedAt: "desc"
      },
      {
        id: "asc"
      }
    ],
    take: 300
  });

  return NextResponse.json({ samples });
});

export const POST = withAuth(async (request: NextRequest) => {
  const body = (await request.json()) as CreateSamplesBody;
  const explicitSamples = Array.isArray(body.samples) ? body.samples : null;
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return jsonError("请先登录后再使用样本库管理系统。", 401);
  }
  const createdBy = currentUser.displayName?.trim() || currentUser.username;

  if (explicitSamples) {
    return createExplicitSamples(explicitSamples, createdBy);
  }

  const projectCode = normalizeProjectCode(body.projectCode ?? "");
  const name = body.name?.trim() ?? "";
  const tubeId = normalizeSampleId(body.tubeId ?? "");
  const type = body.type;
  const count = Number(body.count ?? 0);
  const receivedAt = body.receivedAt ? new Date(body.receivedAt) : null;

  if (!PROJECT_CODE_PATTERN.test(projectCode)) {
    return jsonError(PROJECT_CODE_RULE_TEXT);
  }

  if (!createdBy) {
    return jsonError("请填写入库人。");
  }

  if (!tubeId) {
    return jsonError("请填写冻存管 ID。");
  }

  if (!type || !(type in SAMPLE_TYPES)) {
    return jsonError("请选择有效的样本类型。");
  }

  if (!Number.isInteger(count) || count < 1 || count > 200) {
    return jsonError("入库数量必须是 1 到 200 之间的整数。");
  }

  if (count > 1) {
    return jsonError("批量入库请通过 samples 列表为每个冻存管分别填写已有 ID。");
  }

  if (!receivedAt || Number.isNaN(receivedAt.getTime())) {
    return jsonError("请填写有效的收样时间。");
  }

  const detailValidationError = validateBloodTubeDetail(type, body.detail);
  if (detailValidationError) {
    return jsonError(detailValidationError);
  }

  try {
    const createdPayload = await prisma.$transaction(async (tx) => {
      await tx.project.upsert({
        where: { code: projectCode },
        create: { code: projectCode },
        update: {}
      });

      const maxSequence = await tx.sample.aggregate({
        where: { projectCode },
        _max: { sequence: true }
      });

      const startSequence = (maxSequence._max.sequence ?? 0) + 1;
      const samples = [];
      const batch = await tx.sampleBatch.create({
        data: {
          projectCode,
          name: name || "未命名入库批次",
          createdBy,
          count
        }
      });

      for (let index = 0; index < count; index += 1) {
        const sequence = startSequence + index;
        const sampleId = formatSampleId(projectCode, sequence);
        const detail = body.detail ?? {};
        const originalFragmentDistribution = toOptionalIntegerString(
          detail.originalFragmentDistribution
        );
        const storageLocation = toOptionalString(detail.storageLocation);

        if (detail.originalFragmentDistribution && originalFragmentDistribution === null) {
          throw new Error("INVALID_FRAGMENT_DISTRIBUTION");
        }

        const created = await tx.sample.create({
          data: {
            id: sampleId,
            hashCode: await generateUniqueHashCode(tx, sampleId),
            tubeId,
            batchId: batch.id,
            projectCode,
            sequence,
            name,
            receivedAt,
            type,
            remark: toOptionalString(body.remark),
            detail:
              type === "CDNA" || isBloodTubeSampleType(type)
                ? { create: buildSampleDetailData(detail, storageLocation, originalFragmentDistribution, type) }
                : undefined
          },
          include: {
            detail: true
          }
        });

        samples.push(created);
      }

      return { batch, samples };
    });

    await Promise.all(
      (body.detail ? [toOptionalString(body.detail.storageLocation)] : []).map(addStorageLocationToConfig)
    );

    return NextResponse.json(createdPayload, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_FRAGMENT_DISTRIBUTION") {
      return jsonError("原始片段均值必须填写整数 bp。");
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      if (Array.isArray(error.meta?.target) && error.meta.target.includes("tubeId")) {
        return jsonError("冻存管 ID 已存在，请检查每个冻存管的已有编号。", 409);
      }
      return jsonError("生成样本 ID 时发生重复，请重试。", 409);
    }

    console.error(error);
    return jsonError("样本入库失败，请稍后重试。", 500);
  }
});

async function createExplicitSamples(
  rawSamples: NonNullable<CreateSamplesBody["samples"]>,
  rawCreatedBy: string | undefined
) {
  if (rawSamples.length < 1 || rawSamples.length > 200) {
    return jsonError("入库样本数量必须是 1 到 200 之间的整数。");
  }

  const samples = rawSamples.map((sample) => {
    const id = normalizeSampleId(sample.id ?? "");
    const [projectFromId, sequenceText] = id.split("-");
    const projectCode = normalizeProjectCode(sample.projectCode ?? projectFromId ?? "");
    const sequence = Number(sequenceText);
    const name = sample.name?.trim() ?? "";
    const tubeId = normalizeSampleId(sample.tubeId ?? "");
    const type = sample.type;
    const receivedAt = sample.receivedAt ? new Date(sample.receivedAt) : null;

    return {
      ...sample,
      id,
      projectCode,
      sequence,
      name,
      tubeId,
      type,
      receivedAt
    };
  });

  const projectCodes = new Set(samples.map((sample) => sample.projectCode));
  if (projectCodes.size !== 1) {
    return jsonError("同一批入库样本必须属于同一个项目。");
  }

  const projectCode = samples[0]?.projectCode ?? "";
  const createdBy = rawCreatedBy?.trim() ?? "";
  if (!PROJECT_CODE_PATTERN.test(projectCode)) {
    return jsonError(PROJECT_CODE_RULE_TEXT);
  }

  if (!createdBy) {
    return jsonError("请填写入库人。");
  }

  for (const sample of samples) {
    if (!new RegExp(`^${projectCode}-\\d{4}$`).test(sample.id)) {
      return jsonError(`样本 ID 格式无效：${sample.id}`);
    }

    if (!sample.tubeId) {
      return jsonError(`${sample.id} 必须填写冻存管 ID。`);
    }

    if (!Number.isInteger(sample.sequence) || sample.sequence < 1) {
      return jsonError(`样本 ID 序号无效：${sample.id}`);
    }

    if (!sample.type || !(sample.type in SAMPLE_TYPES)) {
      return jsonError(`请选择 ${sample.id} 的样本类型。`);
    }

    if (!sample.receivedAt || Number.isNaN(sample.receivedAt.getTime())) {
      return jsonError(`请填写 ${sample.id} 的有效收样时间。`);
    }

    const detailValidationError = validateBloodTubeDetail(sample.type, sample.detail);
    if (detailValidationError) {
      return jsonError(`${sample.id}：${detailValidationError}`);
    }
  }

  const uniqueIds = new Set(samples.map((sample) => sample.id));
  if (uniqueIds.size !== samples.length) {
    return jsonError("同一批入库中不能出现重复样本 ID。");
  }

  const uniqueTubeIds = new Set(samples.map((sample) => sample.tubeId));
  if (uniqueTubeIds.size !== samples.length) {
    return jsonError("同一批入库中不能出现重复冻存管 ID。");
  }

  try {
    const createdPayload = await prisma.$transaction(async (tx) => {
      await tx.project.upsert({
        where: { code: projectCode },
        create: { code: projectCode },
        update: {}
      });

      const batch = await tx.sampleBatch.create({
        data: {
          projectCode,
          name: samples.find((sample) => sample.name)?.name ?? "未命名入库批次",
          createdBy,
          count: samples.length
        }
      });

      const created = [];
      for (const sample of samples) {
        const detail = sample.detail ?? {};
        const originalFragmentDistribution = toOptionalIntegerString(
          detail.originalFragmentDistribution
        );
        const storageLocation = toOptionalString(detail.storageLocation);

        if (detail.originalFragmentDistribution && originalFragmentDistribution === null) {
          throw new Error("INVALID_FRAGMENT_DISTRIBUTION");
        }

        const createdSample = await tx.sample.create({
          data: {
            id: sample.id,
            hashCode: await generateUniqueHashCode(tx, sample.id),
            tubeId: sample.tubeId,
            batchId: batch.id,
            projectCode: sample.projectCode,
            sequence: sample.sequence,
            name: sample.name,
            receivedAt: sample.receivedAt as Date,
            type: sample.type as keyof typeof SAMPLE_TYPES,
            remark: toOptionalString(sample.remark),
            detail:
              sample.type === "CDNA" || isBloodTubeSampleType(sample.type)
                ? {
                    create: buildSampleDetailData(
                      detail,
                      storageLocation,
                      originalFragmentDistribution,
                      sample.type
                    )
                  }
                : undefined
          },
          include: {
            detail: true,
            batch: true
          }
        });
        created.push(createdSample);
      }

      return { batch, samples: created };
    });

    await Promise.all(
      Array.from(
        new Set(samples.map((sample) => toOptionalString(sample.detail?.storageLocation)).filter(Boolean))
      ).map(addStorageLocationToConfig)
    );

    return NextResponse.json(createdPayload, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_FRAGMENT_DISTRIBUTION") {
      return jsonError("原始片段均值必须填写整数 bp。");
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      if (Array.isArray(error.meta?.target) && error.meta.target.includes("tubeId")) {
        return jsonError("冻存管 ID 已存在，请检查每个冻存管的已有编号。", 409);
      }
      return jsonError("样本 ID 已存在，请重新生成编号后再提交。", 409);
    }

    console.error(error);
    return jsonError("样本入库失败，请稍后重试。", 500);
  }
}

function buildSampleDetailData(
  detail: CreateSamplesBody["detail"],
  storageLocation: string | null,
  originalFragmentDistribution: string | null,
  sampleType: keyof typeof SAMPLE_TYPES
) {
  return {
    volume: toOptionalNumber(detail?.volume),
    concentration: toOptionalNumber(detail?.concentration),
    storageLocation,
    tissueSource: toOptionalString(detail?.tissueSource),
    technologyType: toOptionalString(detail?.technologyType),
    originalFragmentDistribution,
    experimentMethod: toOptionalString(detail?.experimentMethod),
    loadingVolume: toOptionalNumber(detail?.loadingVolume),
    remark: toOptionalString(detail?.remark),
    tubeRecordName: toOptionalString(detail?.tubeRecordName),
    freshBloodStatus: toOptionalString(detail?.freshBloodStatus),
    frozenWholeBloodTubeCount: toOptionalInteger(detail?.frozenWholeBloodTubeCount),
    frozenPlasmaTubeCount: toOptionalInteger(detail?.frozenPlasmaTubeCount),
    frozenCellTubeCount: toOptionalInteger(detail?.frozenCellTubeCount),
    qualityControlCellCount:
      sampleType === "CELL" ? toOptionalString(detail?.qualityControlCellCount) : null,
    storageCondition: toOptionalString(detail?.storageCondition),
    preservationMedium: sampleType === "CELL" ? toOptionalString(detail?.preservationMedium) : null,
    experimentDate: toOptionalString(detail?.experimentDate),
    experimentLocation: toOptionalString(detail?.experimentLocation),
    experimenter: toOptionalString(detail?.experimenter),
    checker: toOptionalString(detail?.checker),
    patientGroup: toOptionalString(detail?.patientGroup),
    projectTeacher: toOptionalString(detail?.projectTeacher)
  };
}

function validateBloodTubeDetail(
  sampleType: keyof typeof SAMPLE_TYPES | undefined,
  detail: CreateSamplesBody["detail"]
) {
  if (!isBloodTubeSampleType(sampleType)) {
    return null;
  }

  const freshBloodStatus = toOptionalString(detail?.freshBloodStatus);
  if (freshBloodStatus && !isAllowedOption(freshBloodStatus, FRESH_BLOOD_STATUS_OPTIONS)) {
    return "新鲜血液情况选项无效。";
  }

  const storageCondition = toOptionalString(detail?.storageCondition);
  if (storageCondition && !isAllowedOption(storageCondition, STORAGE_CONDITION_OPTIONS)) {
    return "储存条件选项无效。";
  }

  const checker = toOptionalString(detail?.checker);
  if (checker && !isAllowedOption(checker, SAMPLE_CHECKER_OPTIONS)) {
    return "登记及核对人员选项无效。";
  }

  if (sampleType === "CELL") {
    const preservationMedium = toOptionalString(detail?.preservationMedium);
    if (
      preservationMedium &&
      !isAllowedOption(preservationMedium, CELL_PRESERVATION_MEDIUM_OPTIONS)
    ) {
      return "细胞保存介质选项无效。";
    }
  }

  return null;
}

function isAllowedOption(value: string, options: readonly string[]) {
  return options.some((option) => option === value);
}

function toOptionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? numberValue : null;
}
