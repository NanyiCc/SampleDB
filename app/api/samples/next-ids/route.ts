import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { PROJECT_CODE_PATTERN, PROJECT_CODE_RULE_TEXT, formatSampleId, normalizeProjectCode } from "@/lib/domain";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export const GET = withAuth(async (request: NextRequest) => {
  const projectCode = normalizeProjectCode(request.nextUrl.searchParams.get("projectCode") ?? "");
  const count = Number(request.nextUrl.searchParams.get("count") ?? 0);

  if (!PROJECT_CODE_PATTERN.test(projectCode)) {
    return jsonError(PROJECT_CODE_RULE_TEXT);
  }

  if (!Number.isInteger(count) || count < 1 || count > 200) {
    return jsonError("生成数量必须是 1 到 200 之间的整数。");
  }

  const maxSequence = await prisma.sample.aggregate({
    where: { projectCode },
    _max: { sequence: true }
  });
  const startSequence = (maxSequence._max.sequence ?? 0) + 1;
  const ids = Array.from({ length: count }, (_, index) =>
    formatSampleId(projectCode, startSequence + index)
  );

  return NextResponse.json({ ids, projectCode, startSequence });
});
