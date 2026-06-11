import { NextRequest } from "next/server";
import { EXPERIMENT_CONFIG, normalizeSampleId, SAMPLE_TYPES, formatDateTime } from "@/lib/domain";
import { escapeHtml, excelResponse, jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ensureAllHashCodes, resolveSampleIdentity } from "@/lib/sample-identity";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sampleId: string }> | { sampleId: string };
};

export async function GET(_request: NextRequest, context: RouteContext) {
  await ensureAllHashCodes();

  const params = await context.params;
  const requestedId = normalizeSampleId(decodeURIComponent(params.sampleId));
  const identity = await resolveSampleIdentity(prisma, requestedId);
  const sampleId = identity?.id ?? requestedId;
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
  const downstream = await getDirectDerivedSteps(sampleId);
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
      entries: true,
      sequencingResult: true
    },
    orderBy: {
      registeredAt: "desc"
    }
  });

  const currentRows = [
    sectionTitle("当前样本"),
    row(["样本ID", "短码", "类型", "项目ID/实验", "时间", "备注"]),
    baseSample
      ? row([
          baseSample.id,
          baseSample.hashCode ?? "",
          SAMPLE_TYPES[baseSample.type],
          baseSample.projectCode,
          formatDateTime(baseSample.storedAt),
          baseSample.remark ?? ""
        ])
      : row([
          derivedSample?.id ?? "",
          derivedSample?.hashCode ?? "",
          "实验派生样本",
          derivedSample ? EXPERIMENT_CONFIG[derivedSample.experimentType].label : "",
          derivedSample ? formatDateTime(derivedSample.createdAt) : "",
          derivedSample?.result?.remark ?? ""
        ])
  ];
  const rootRows = upstream.rootSample
    ? [
        sectionTitle("原始来源"),
        row(["样本ID", "短码", "项目ID", "样本名称", "入库人", "样本类型", "储存位置", "收样时间"]),
        row([
          upstream.rootSample.id,
          upstream.rootSample.hashCode ?? "",
          upstream.rootSample.projectCode,
          upstream.rootSample.name,
          upstream.rootSample.batch?.createdBy ?? "",
          SAMPLE_TYPES[upstream.rootSample.type],
          upstream.rootSample.detail?.storageLocation ?? "",
          formatDateTime(upstream.rootSample.receivedAt)
        ])
      ]
    : [];
  const upstreamRows = [
    sectionTitle("上游步骤"),
    row(["派生样本ID", "短码", "来源样本ID", "实验类型", "登记ID", "上样量/投入量(ng)", "提交时间"]),
    ...upstream.steps.map((step) =>
      row([
        step.id,
        step.hashCode ?? "",
        step.sourceSampleId,
        EXPERIMENT_CONFIG[step.experimentType].label,
        step.entry?.registration.id ?? "",
        step.entry?.inputAmountNg ?? "",
        step.result?.submittedAt ? formatDateTime(step.result.submittedAt) : ""
      ])
    )
  ];
  const downstreamRows = [
    sectionTitle("下游取用"),
    row(["派生样本ID", "短码", "来源样本ID", "实验类型", "登记ID", "上样量/投入量(ng)", "提交时间"]),
    ...downstream.map((step) =>
      row([
        step.id,
        step.hashCode ?? "",
        step.sourceSampleId,
        EXPERIMENT_CONFIG[step.experimentType].label,
        step.entry?.registration.id ?? "",
        step.entry?.inputAmountNg ?? "",
        step.result?.submittedAt ? formatDateTime(step.result.submittedAt) : ""
      ])
    )
  ];
  const sequencingRows = [
    sectionTitle("测序芯片"),
    row(["登记ID", "芯片编号", "测序策略", "投入文库", "上传路径", "提交时间"]),
    ...sequencingRegistrations.map((registration) =>
      row([
        registration.id,
        registration.chipNumber ?? "",
        registration.sequencingStrategy ?? registration.sequencingResult?.sequencingStrategy ?? "",
        registration.entries.map((entry) => entry.sourceSampleId).join(", "),
        registration.sequencingResult?.uploadPath ?? "",
        registration.sequencingResult?.submittedAt ? formatDateTime(registration.sequencingResult.submittedAt) : ""
      ])
    )
  ];

  return excelResponse(
    `查询结果_${sampleId}.xls`,
    [...currentRows, ...rootRows, ...upstreamRows, ...downstreamRows, ...sequencingRows].join(""),
    `查询结果 ${sampleId}`
  );
}

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

async function getDirectDerivedSteps(sourceSampleId: string) {
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
      createdAt: "desc"
    }
  });
}

async function buildUpstream(sampleId: string) {
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

  return {
    rootSample,
    steps: reversedSteps.reverse()
  };
}

function sectionTitle(title: string) {
  return `<tr><th colspan="8">${escapeHtml(title)}</th></tr>`;
}

function row(cells: unknown[]) {
  return `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
}
