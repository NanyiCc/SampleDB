import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth";
import { EXPERIMENT_CONFIG, formatDateTime, normalizeProjectCode, SAMPLE_TYPES } from "@/lib/domain";
import { escapeHtml, excelResponse, jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ensureAllHashCodes } from "@/lib/sample-identity";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectCode: string }>;
};

export const GET = withAuth(async (_request: NextRequest, context: RouteContext) => {
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
  const downstream = await prisma.derivedSample.findMany({
    where: {
      sourceSampleId: {
        in: samples.map((sample) => sample.id)
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
      createdAt: "asc"
    }
  });
  const downstreamBySource = new Map<string, typeof downstream>();
  for (const item of downstream) {
    const list = downstreamBySource.get(item.sourceSampleId) ?? [];
    list.push(item);
    downstreamBySource.set(item.sourceSampleId, list);
  }

  const sampleRows = [
    sectionTitle("项目原始样本", 10),
    row(["样本ID", "冻存管ID", "短码", "样本名称", "入库人", "类型", "储存位置", "收样时间", "下游实验数", "已提交下游数"]),
    ...samples.map((sample) => {
      const items = downstreamBySource.get(sample.id) ?? [];
      return row([
        sample.id,
        sample.tubeId ?? "",
        sample.hashCode ?? "",
        sample.name,
        sample.batch?.createdBy ?? "",
        SAMPLE_TYPES[sample.type],
        sample.detail?.storageLocation ?? "",
        formatDateTime(sample.receivedAt),
        items.length,
        items.filter((item) => item.result?.submittedAt).length
      ]);
    })
  ];
  const downstreamRows = [
    sectionTitle("下游样本"),
    row(["原始样本ID", "派生样本ID", "短码", "实验类型", "登记ID", "取样量/投入量", "单位", "提交时间"]),
    ...downstream.map((item) =>
      row([
        item.sourceSampleId,
        item.id,
        item.hashCode ?? "",
        EXPERIMENT_CONFIG[item.experimentType].label,
        item.entry?.registration.id ?? "",
        item.entry?.inputAmount ?? item.entry?.inputAmountNg ?? "",
        item.entry?.inputUnit ??
          (item.entry?.inputAmountNg !== null && item.entry?.inputAmountNg !== undefined ? "ng" : ""),
        item.result?.submittedAt ? formatDateTime(item.result.submittedAt) : ""
      ])
    )
  ];

  return excelResponse(
    `项目_${projectCode}.xls`,
    [...sampleRows, ...downstreamRows].join(""),
    `项目 ${projectCode}`
  );
});

function sectionTitle(title: string, colSpan = 9) {
  return `<tr><th colspan="${colSpan}">${escapeHtml(title)}</th></tr>`;
}

function row(cells: unknown[]) {
  return `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
}
