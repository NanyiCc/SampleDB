import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser, withAuth } from "@/lib/auth";
import {
  EXPERIMENT_CONFIG,
  ExperimentType,
  formatDerivedSampleId,
  normalizeProjectCode,
  normalizeSampleId
} from "@/lib/domain";
import { validateExperimentRule } from "@/lib/experiment-rules";
import { jsonError, toOptionalString } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  ensureAllHashCodes,
  generateUniqueHashCode,
  type SampleIdentity,
  resolveSampleIdentity
} from "@/lib/sample-identity";

export const runtime = "nodejs";

type RegistrationBody = {
  experimentType?: ExperimentType;
  title?: string;
  projectCode?: string;
  operator?: string;
  remark?: string;
  chipNumber?: string;
  sequencingStrategy?: string;
  storagePath?: string;
  entries?: Array<{
    sampleId?: string;
    inputAmount?: unknown;
    inputUnit?: string;
    /** @deprecated Kept for clients created before sampling units became configurable. */
    inputAmountNg?: unknown;
  }>;
};

export const GET = withAuth(async () => {
  await ensureAllHashCodes();

  const registrations = await prisma.samplingRegistration.findMany({
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
    },
    take: 100
  });

  return NextResponse.json({ registrations: await hydrateRegistrationSources(registrations) });
});

export const POST = withAuth(async (request: NextRequest) => {
  const body = (await request.json()) as RegistrationBody;
  const experimentType = body.experimentType;
  const title = toOptionalString(body.title);
  const requestedProjectCode = normalizeProjectCode(body.projectCode ?? "");
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return jsonError("请先登录后再使用样本库管理系统。", 401);
  }
  const operator = currentUser.displayName?.trim() || currentUser.username;
  const rawEntries = Array.isArray(body.entries) ? body.entries : [];

  if (!experimentType || !(experimentType in EXPERIMENT_CONFIG)) {
    return jsonError("请选择有效的实验类型。");
  }

  if (!operator) {
    return jsonError("请填写操作员。");
  }

  const isSequencing = experimentType === "SEQUENCING";
  const chipNumber = body.chipNumber?.trim().toUpperCase() ?? "";
  const sequencingStrategy = body.sequencingStrategy?.trim() ?? "";

  if (isSequencing && !chipNumber) {
    return jsonError("测序上机需要填写唯一芯片编号。");
  }

  if (isSequencing && !sequencingStrategy) {
    return jsonError("测序上机需要填写测序策略。");
  }

  const rawInputEntries = rawEntries
    .map((entry) => ({
      sampleId: normalizeSampleId(entry.sampleId ?? ""),
      inputAmount: Number(entry.inputAmount ?? entry.inputAmountNg),
      inputUnit: toOptionalString(entry.inputUnit) ?? (entry.inputAmountNg !== undefined ? "ng" : "")
    }))
    .filter((entry) => entry.sampleId.length > 0);

  if (rawInputEntries.length === 0) {
    return jsonError("请至少登记一个取用样本。");
  }

  if (rawInputEntries.some((entry) => !Number.isFinite(entry.inputAmount) || entry.inputAmount < 0)) {
    return jsonError("取样量/投入量必须是大于或等于 0 的数字。");
  }

  if (rawInputEntries.some((entry) => !entry.inputUnit)) {
    return jsonError("请填写每个取用样本的单位。");
  }

  try {
    const createdRegistration = await prisma.$transaction(async (tx) => {
      const identities: Array<SampleIdentity & { inputAmount: number; inputUnit: string; inputValue: string }> = [];
      const missingInputs: string[] = [];

      for (const entry of rawInputEntries) {
        const identity = await resolveSampleIdentity(tx, entry.sampleId, {
          tubeOnly: experimentType === "SINGLE_CELL"
        });
        if (!identity) {
          missingInputs.push(entry.sampleId);
        } else {
          identities.push({
            ...identity,
            inputAmount: entry.inputAmount,
            inputUnit: entry.inputUnit,
            inputValue: entry.sampleId
          });
        }
      }

      if (missingInputs.length > 0) {
        throw new Error(
          `${experimentType === "SINGLE_CELL" ? "MISSING_TUBE" : "MISSING_SAMPLE"}:${missingInputs.join(", ")}`
        );
      }

      const entries = identities.map((identity) => ({
        sampleId: identity.id,
        inputAmount: identity.inputAmount,
        inputUnit: identity.inputUnit,
        inputValue: identity.inputValue
      }));
      const sourceProjectCodes = Array.from(
        new Set(identities.map((identity) => identity.projectCode).filter((code): code is string => Boolean(code)))
      );
      const projectCode = requestedProjectCode || (sourceProjectCodes.length === 1 ? sourceProjectCodes[0] : null);

      if (requestedProjectCode && sourceProjectCodes.some((code) => code !== requestedProjectCode)) {
        throw new Error(`PROJECT_MISMATCH:${sourceProjectCodes.join(", ")}`);
      }

      const ruleValidation = await validateExperimentRule(
        Array.from(new Set(entries.map((entry) => entry.sampleId))),
        experimentType
      );
      if (ruleValidation.violations.length > 0) {
        throw new Error(`RULE_VIOLATION:${ruleValidation.violations.join("；")}`);
      }

      const flowViolations = await validateBuiltInExperimentFlow(tx, entries.map((entry) => entry.sampleId), experimentType);
      if (flowViolations.length > 0) {
        throw new Error(`FLOW_VIOLATION:${flowViolations.join("；")}`);
      }

      const registration = await tx.samplingRegistration.create({
        data: {
          title,
          projectCode,
          experimentType,
          operator,
          remark: toOptionalString(body.remark),
          chipNumber: isSequencing ? chipNumber : null,
          sequencingStrategy: isSequencing ? sequencingStrategy : null,
          storagePath: isSequencing ? toOptionalString(body.storagePath) : null
        }
      });

      const suffix = EXPERIMENT_CONFIG[experimentType].suffix;
      const nextSequences = new Map<string, number>();

      for (const entry of entries) {
        let nextSequence = nextSequences.get(entry.sampleId);
        if (!nextSequence) {
          const maxDerivedSequence = await tx.derivedSample.aggregate({
            where: {
              sourceSampleId: entry.sampleId,
              experimentType
            },
            _max: {
              sequence: true
            }
          });
          nextSequence = (maxDerivedSequence._max.sequence ?? 0) + 1;
        }

        const derivedSampleId = formatDerivedSampleId(entry.sampleId, suffix, nextSequence);
        nextSequences.set(entry.sampleId, nextSequence + 1);

        await tx.derivedSample.create({
          data: {
            id: derivedSampleId,
            hashCode: await generateUniqueHashCode(tx, derivedSampleId),
            sourceSampleId: entry.sampleId,
            experimentType,
            suffix,
            sequence: nextSequence
          }
        });

        await tx.samplingEntry.create({
          data: {
            registrationId: registration.id,
            sourceSampleId: entry.sampleId,
            inputAmount: entry.inputAmount,
            inputUnit: entry.inputUnit,
            derivedSampleId
          }
        });
      }

      return tx.samplingRegistration.findUniqueOrThrow({
        where: {
          id: registration.id
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
        }
      });
    });

    const [hydratedRegistration] = await hydrateRegistrationSources([createdRegistration]);
    return NextResponse.json({ registration: hydratedRegistration }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("MISSING_SAMPLE:")) {
      return jsonError(`以下样本 ID/短码不存在：${error.message.replace("MISSING_SAMPLE:", "")}`, 404);
    }

    if (error instanceof Error && error.message.startsWith("MISSING_TUBE:")) {
      return jsonError(`以下冻存管 ID 不存在：${error.message.replace("MISSING_TUBE:", "")}`, 404);
    }

    if (error instanceof Error && error.message.startsWith("PROJECT_MISMATCH:")) {
      return jsonError(`登记项目 ID 与样本所属项目不一致：${error.message.replace("PROJECT_MISMATCH:", "")}`);
    }

    if (error instanceof Error && error.message.startsWith("RULE_VIOLATION:")) {
      return jsonError(error.message.replace("RULE_VIOLATION:", ""));
    }

    if (error instanceof Error && error.message.startsWith("FLOW_VIOLATION:")) {
      return jsonError(error.message.replace("FLOW_VIOLATION:", ""));
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes("chipNumber")
    ) {
      return jsonError("芯片编号已存在，请换一个唯一编号。", 409);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError("生成派生样本 ID 时发生重复，请重试。", 409);
    }

    console.error(error);
    return jsonError("取样登记失败，请稍后重试。", 500);
  }
});

type RegistrationWithEntries = {
  entries: Array<{
    sourceSampleId: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

async function hydrateRegistrationSources<T extends RegistrationWithEntries>(registrations: T[]) {
  const sourceIds = Array.from(
    new Set(registrations.flatMap((registration) => registration.entries.map((entry) => entry.sourceSampleId)))
  );

  const [samples, derivedSamples] = await Promise.all([
    prisma.sample.findMany({
      where: {
        id: {
          in: sourceIds
        }
      },
      include: {
        detail: true
      }
    }),
    prisma.derivedSample.findMany({
      where: {
        id: {
          in: sourceIds
        }
      },
      include: {
        result: true
      }
    })
  ]);

  const sampleMap = new Map(samples.map((sample) => [sample.id, sample]));
  const derivedMap = new Map(derivedSamples.map((sample) => [sample.id, sample]));

  return registrations.map((registration) => ({
    ...registration,
    entries: registration.entries.map((entry) => {
      const sourceSample = sampleMap.get(entry.sourceSampleId) ?? null;
      const sourceDerivedSample = derivedMap.get(entry.sourceSampleId) ?? null;
      return {
        ...entry,
        sourceSample,
        sourceDerivedSample,
        sourceName: sourceSample?.name ?? sourceDerivedSample?.id ?? entry.sourceSampleId
      };
    })
  }));
}

async function validateBuiltInExperimentFlow(
  tx: Prisma.TransactionClient,
  sourceSampleIds: string[],
  experimentType: ExperimentType
) {
  const violations: string[] = [];

  for (const sourceSampleId of sourceSampleIds) {
    const baseSample = await tx.sample.findUnique({
      where: {
        id: sourceSampleId
      },
      select: {
        id: true,
        type: true
      }
    });

    if (baseSample) {
      if (baseSample.type === "TISSUE" && experimentType !== "TISSUE_SECTION") {
        violations.push(`${baseSample.id} 是组织样本，目前只能登记组织切片。`);
      }

      if (baseSample.type === "CDNA" && ["TISSUE_SECTION", "SECTION_PLACEMENT", "CDNA_PREP"].includes(experimentType)) {
        violations.push(`${baseSample.id} 是 cDNA 样本，不能进入组织流程实验。`);
      }

      continue;
    }

    const derivedSample = await tx.derivedSample.findUnique({
      where: {
        id: sourceSampleId
      },
      include: {
        result: true
      }
    });

    if (!derivedSample) {
      continue;
    }

    if (experimentType === "SECTION_PLACEMENT") {
      if (derivedSample.experimentType !== "TISSUE_SECTION" || !derivedSample.result?.submittedAt) {
        violations.push(`${sourceSampleId} 不是已提交的组织切片样本，不能登记实贴片。`);
      }
      continue;
    }

    if (experimentType === "CDNA_PREP") {
      if (derivedSample.experimentType !== "SECTION_PLACEMENT" || !derivedSample.result?.submittedAt) {
        violations.push(`${sourceSampleId} 不是已提交的实贴片样本，不能登记制取cDNA。`);
      }
      continue;
    }

    if (experimentType === "TISSUE_SECTION") {
      violations.push(`${sourceSampleId} 不是原始组织样本，不能登记组织切片。`);
      continue;
    }

    if (derivedSample.experimentType === "TISSUE_SECTION" || derivedSample.experimentType === "SECTION_PLACEMENT") {
      violations.push(`${sourceSampleId} 仍在组织流程中，不能直接登记 ${EXPERIMENT_CONFIG[experimentType].label}。`);
    }
  }

  return violations;
}
