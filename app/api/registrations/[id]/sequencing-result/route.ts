import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth";
import { jsonError, toOptionalNumber, toOptionalString } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type ResultBody = {
  mode?: "draft" | "submit";
  dataAmount?: string;
  uploadPath?: string;
  sequencingStrategy?: string;
  barcode?: unknown;
  remark?: string;
};

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export const POST = withAuth(async (request: NextRequest, context: RouteContext) => {
  const params = await context.params;
  const registrationId = Number(params.id);
  const body = (await request.json()) as ResultBody;
  const mode = body.mode === "draft" ? "draft" : "submit";

  if (!Number.isInteger(registrationId) || registrationId <= 0) {
    return jsonError("登记 ID 无效。");
  }

  const registration = await prisma.samplingRegistration.findUnique({
    where: {
      id: registrationId
    },
    include: {
      sequencingResult: true
    }
  });

  if (!registration) {
    return jsonError("取样登记不存在。", 404);
  }

  if (registration.experimentType !== "SEQUENCING") {
    return jsonError("该登记不是测序上机登记。", 400);
  }

  if (registration.sequencingResult?.submittedAt) {
    return jsonError("该测序下机结果已经提交，不能继续修改。", 409);
  }

  const barcode = toOptionalNumber(body.barcode);
  if (barcode !== null && (!Number.isInteger(barcode) || barcode < 1 || barcode > 16)) {
    return jsonError("Barcode 必须是 1 到 16 之间的整数。");
  }

  const data = {
    dataAmount: toOptionalString(body.dataAmount),
    uploadPath: toOptionalString(body.uploadPath),
    sequencingStrategy: toOptionalString(body.sequencingStrategy),
    barcode,
    remark: toOptionalString(body.remark),
    submittedAt: mode === "submit" ? new Date() : null
  };

  const result = await prisma.sequencingResult.upsert({
    where: {
      registrationId
    },
    create: {
      registrationId,
      ...data
    },
    update: data
  });

  return Response.json({ result });
});

export const DELETE = withAuth(async (_request: NextRequest, context: RouteContext) => {
  const params = await context.params;
  const registrationId = Number(params.id);

  if (!Number.isInteger(registrationId) || registrationId <= 0) {
    return jsonError("登记 ID 无效。");
  }

  const registration = await prisma.samplingRegistration.findUnique({
    where: {
      id: registrationId
    },
    include: {
      entries: true,
      sequencingResult: true
    }
  });

  if (!registration) {
    return jsonError("取样登记不存在。", 404);
  }

  if (registration.experimentType !== "SEQUENCING") {
    return jsonError("该登记不是测序上机登记。", 400);
  }

  if (registration.sequencingResult?.submittedAt) {
    return jsonError("已提交的测序下机结果不能删除。", 409);
  }

  const derivedSampleIds = registration.entries.map((entry) => entry.derivedSampleId);
  await prisma.$transaction([
    prisma.sequencingResult.deleteMany({
      where: {
        registrationId
      }
    }),
    prisma.derivedSample.deleteMany({
      where: {
        id: {
          in: derivedSampleIds
        }
      }
    }),
    prisma.samplingRegistration.delete({
      where: {
        id: registrationId
      }
    })
  ]);

  return Response.json({ ok: true });
});
