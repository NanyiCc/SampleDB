import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth";
import { SAMPLE_TYPES, formatDate, formatDateTime } from "@/lib/domain";
import { escapeHtml, excelResponse, jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ensureAllHashCodes } from "@/lib/sample-identity";

export const runtime = "nodejs";

export const GET = withAuth(async (request: NextRequest) => {
  await ensureAllHashCodes();

  const batchId = Number(request.nextUrl.searchParams.get("batchId") ?? 0);
  const ids = request.nextUrl.searchParams
    .get("ids")
    ?.split(",")
    .map((id) => id.trim().toUpperCase())
    .filter(Boolean);

  if ((!ids || ids.length === 0) && (!Number.isInteger(batchId) || batchId <= 0)) {
    return jsonError("缺少需要导出的样本 ID。");
  }

  const samples = await prisma.sample.findMany({
    where:
      Number.isInteger(batchId) && batchId > 0
        ? { batchId }
        : {
            id: {
              in: ids
            }
          },
    include: {
      detail: true,
      batch: true
    }
  });

  if (ids && ids.length > 0) {
    const order = new Map(ids.map((id, index) => [id, index]));
    samples.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  } else {
    samples.sort((a, b) => a.sequence - b.sequence);
  }

  const rows = [
    `<tr>
      <th>样本ID</th>
      <th>短码</th>
      <th>项目ID</th>
      <th>样本名称</th>
      <th>入库人</th>
      <th>样本类型</th>
      <th>收样时间</th>
      <th>入库时间</th>
      <th>体积 (µL)</th>
      <th>浓度 (ng/µL)</th>
      <th>储存位置</th>
      <th>所属组织</th>
      <th>原始片段均值 (bp)</th>
      <th>备注</th>
    </tr>`,
    ...samples.map(
      (sample) => `<tr>
      <td>${escapeHtml(sample.id)}</td>
      <td>${escapeHtml(sample.hashCode ?? "")}</td>
      <td>${escapeHtml(sample.projectCode)}</td>
      <td>${escapeHtml(sample.name)}</td>
      <td>${escapeHtml(sample.batch?.createdBy ?? "")}</td>
      <td>${escapeHtml(SAMPLE_TYPES[sample.type])}</td>
      <td>${escapeHtml(formatDate(sample.receivedAt))}</td>
      <td>${escapeHtml(formatDateTime(sample.storedAt))}</td>
      <td>${escapeHtml(sample.detail?.volume ?? "")}</td>
      <td>${escapeHtml(sample.detail?.concentration ?? "")}</td>
      <td>${escapeHtml(sample.detail?.storageLocation ?? "")}</td>
      <td>${escapeHtml(sample.detail?.tissueSource ?? "")}</td>
      <td>${escapeHtml(sample.detail?.originalFragmentDistribution ?? "")}</td>
      <td>${escapeHtml(sample.remark ?? sample.detail?.remark ?? "")}</td>
    </tr>`
    )
  ].join("");

  return excelResponse(
    `样本入库_${batchId > 0 ? `批次${batchId}` : new Date().toISOString().slice(0, 10)}.xls`,
    rows,
    "样本入库表"
  );
});
