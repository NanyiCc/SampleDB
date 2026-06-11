import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  PROJECT_CODE_PATTERN,
  PROJECT_CODE_RULE_TEXT,
  formatSampleId,
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
  };
  samples?: Array<{
    id?: string;
    projectCode?: string;
    name?: string;
    receivedAt?: string;
    type?: keyof typeof SAMPLE_TYPES;
    remark?: string;
    detail?: CreateSamplesBody["detail"];
  }>;
};

export async function GET() {
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
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as CreateSamplesBody;
  const explicitSamples = Array.isArray(body.samples) ? body.samples : null;

  if (explicitSamples) {
    return createExplicitSamples(explicitSamples, body.createdBy);
  }

  const projectCode = normalizeProjectCode(body.projectCode ?? "");
  const name = body.name?.trim() ?? "";
  const createdBy = body.createdBy?.trim() ?? "";
  const type = body.type;
  const count = Number(body.count ?? 0);
  const receivedAt = body.receivedAt ? new Date(body.receivedAt) : null;

  if (!PROJECT_CODE_PATTERN.test(projectCode)) {
    return jsonError(PROJECT_CODE_RULE_TEXT);
  }

  if (!createdBy) {
    return jsonError("请填写入库人。");
  }

  if (!type || !(type in SAMPLE_TYPES)) {
    return jsonError("请选择有效的样本类型。");
  }

  if (!Number.isInteger(count) || count < 1 || count > 200) {
    return jsonError("入库数量必须是 1 到 200 之间的整数。");
  }

  if (!receivedAt || Number.isNaN(receivedAt.getTime())) {
    return jsonError("请填写有效的收样时间。");
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
            batchId: batch.id,
            projectCode,
            sequence,
            name,
            receivedAt,
            type,
            remark: toOptionalString(body.remark),
            detail:
              type === "CDNA"
                ? {
                    create: {
                      volume: toOptionalNumber(detail.volume),
                      concentration: toOptionalNumber(detail.concentration),
                      storageLocation,
                      tissueSource: toOptionalString(detail.tissueSource),
                      technologyType: toOptionalString(detail.technologyType),
                      originalFragmentDistribution,
                      experimentMethod: toOptionalString(detail.experimentMethod),
                      loadingVolume: toOptionalNumber(detail.loadingVolume),
                      remark: toOptionalString(detail.remark)
                    }
                  }
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
      return jsonError("生成样本 ID 时发生重复，请重试。", 409);
    }

    console.error(error);
    return jsonError("样本入库失败，请稍后重试。", 500);
  }
}

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
    const type = sample.type;
    const receivedAt = sample.receivedAt ? new Date(sample.receivedAt) : null;

    return {
      ...sample,
      id,
      projectCode,
      sequence,
      name,
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

    if (!Number.isInteger(sample.sequence) || sample.sequence < 1) {
      return jsonError(`样本 ID 序号无效：${sample.id}`);
    }

    if (!sample.type || !(sample.type in SAMPLE_TYPES)) {
      return jsonError(`请选择 ${sample.id} 的样本类型。`);
    }

    if (!sample.receivedAt || Number.isNaN(sample.receivedAt.getTime())) {
      return jsonError(`请填写 ${sample.id} 的有效收样时间。`);
    }
  }

  const uniqueIds = new Set(samples.map((sample) => sample.id));
  if (uniqueIds.size !== samples.length) {
    return jsonError("同一批入库中不能出现重复样本 ID。");
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
            batchId: batch.id,
            projectCode: sample.projectCode,
            sequence: sample.sequence,
            name: sample.name,
            receivedAt: sample.receivedAt as Date,
            type: sample.type as keyof typeof SAMPLE_TYPES,
            remark: toOptionalString(sample.remark),
            detail:
              sample.type === "CDNA"
                ? {
                    create: {
                      volume: toOptionalNumber(detail.volume),
                      concentration: toOptionalNumber(detail.concentration),
                      storageLocation,
                      tissueSource: toOptionalString(detail.tissueSource),
                      technologyType: toOptionalString(detail.technologyType),
                      originalFragmentDistribution,
                      experimentMethod: toOptionalString(detail.experimentMethod),
                      loadingVolume: toOptionalNumber(detail.loadingVolume),
                      remark: toOptionalString(detail.remark)
                    }
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
      return jsonError("样本 ID 已存在，请重新生成编号后再提交。", 409);
    }

    console.error(error);
    return jsonError("样本入库失败，请稍后重试。", 500);
  }
}
