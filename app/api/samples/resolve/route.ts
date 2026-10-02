import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { EXPERIMENT_CONFIG, SAMPLE_TYPES, normalizeSampleId } from "@/lib/domain";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ensureAllHashCodes, resolveSampleIdentity } from "@/lib/sample-identity";

export const runtime = "nodejs";

export const GET = withAuth(async (request: NextRequest) => {
  await ensureAllHashCodes();

  const query = normalizeSampleId(request.nextUrl.searchParams.get("q") ?? "");

  if (!query) {
    return jsonError("请输入样本 ID、冻存管 ID 或短码。");
  }

  const identity = await resolveSampleIdentity(prisma, query);

  if (!identity) {
    return jsonError("没有找到该样本 ID、冻存管 ID 或短码。", 404);
  }

  return NextResponse.json({
    sample: {
      ...identity,
      label:
        identity.kind === "BASE_SAMPLE" && identity.type
          ? SAMPLE_TYPES[identity.type as keyof typeof SAMPLE_TYPES]
          : identity.experimentType
            ? EXPERIMENT_CONFIG[identity.experimentType as keyof typeof EXPERIMENT_CONFIG].label
            : "派生样本"
    }
  });
});
