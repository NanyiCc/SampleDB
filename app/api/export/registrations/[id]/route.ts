import { NextRequest } from "next/server";
import { EXPERIMENT_CONFIG, formatDateTime } from "@/lib/domain";
import { escapeHtml, excelResponse, jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ensureAllHashCodes } from "@/lib/sample-identity";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function GET(_request: NextRequest, context: RouteContext) {
  await ensureAllHashCodes();

  const params = await context.params;
  const id = Number(params.id);

  if (!Number.isInteger(id)) {
    return jsonError("登记 ID 无效。");
  }

  const registration = await prisma.samplingRegistration.findUnique({
    where: {
      id
    },
    include: {
      entries: {
        include: {
          derivedSample: true
        },
        orderBy: {
          id: "asc"
        }
      }
    }
  });

  if (!registration) {
    return jsonError("取样登记不存在。", 404);
  }

  const config = EXPERIMENT_CONFIG[registration.experimentType];
  const sourceIds = registration.entries.map((entry) => entry.sourceSampleId);
  const [sourceSamples, sourceDerivedSamples] = await Promise.all([
    prisma.sample.findMany({
      where: {
        id: {
          in: sourceIds
        }
      },
      select: {
        id: true,
        hashCode: true,
        name: true
      }
    }),
    prisma.derivedSample.findMany({
      where: {
        id: {
          in: sourceIds
        }
      },
      select: {
        id: true,
        hashCode: true
      }
    })
  ]);
  const sourceNameMap = new Map([
    ...sourceSamples.map((sample) => [sample.id, sample.name] as const),
    ...sourceDerivedSamples.map((sample) => [sample.id, sample.id] as const)
  ]);
  const sourceHashMap = new Map([
    ...sourceSamples.map((sample) => [sample.id, sample.hashCode] as const),
    ...sourceDerivedSamples.map((sample) => [sample.id, sample.hashCode] as const)
  ]);
  const rows = [
    `<tr>
      <th>登记ID</th>
      <th>登记标题</th>
      <th>项目ID</th>
      <th>登记时间</th>
      <th>操作员</th>
      <th>实验类型</th>
      <th>芯片编号</th>
      <th>测序策略</th>
      <th>储存路径</th>
      <th>原样本ID</th>
      <th>原样本短码</th>
      <th>样本名称</th>
      <th>上样量/投入量 (ng)</th>
      <th>生成样本ID</th>
      <th>生成样本短码</th>
      <th>备注</th>
    </tr>`,
    ...registration.entries.map(
      (entry) => `<tr>
      <td>${escapeHtml(registration.id)}</td>
      <td>${escapeHtml(registration.title ?? "")}</td>
      <td>${escapeHtml(registration.projectCode ?? "")}</td>
      <td>${escapeHtml(formatDateTime(registration.registeredAt))}</td>
      <td>${escapeHtml(registration.operator)}</td>
      <td>${escapeHtml(config.label)}</td>
      <td>${escapeHtml(registration.chipNumber ?? "")}</td>
      <td>${escapeHtml(registration.sequencingStrategy ?? "")}</td>
      <td>${escapeHtml(registration.storagePath ?? "")}</td>
      <td>${escapeHtml(entry.sourceSampleId)}</td>
      <td>${escapeHtml(sourceHashMap.get(entry.sourceSampleId) ?? "")}</td>
      <td>${escapeHtml(sourceNameMap.get(entry.sourceSampleId) ?? entry.sourceSampleId)}</td>
      <td>${escapeHtml(entry.inputAmountNg)}</td>
      <td>${escapeHtml(entry.derivedSampleId)}</td>
      <td>${escapeHtml(entry.derivedSample.hashCode ?? "")}</td>
      <td>${escapeHtml(registration.remark ?? "")}</td>
    </tr>`
    )
  ].join("");

  return excelResponse(`取样登记_${registration.id}.xls`, rows, `取样登记 ${registration.id}`);
}
