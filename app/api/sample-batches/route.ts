import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureAllHashCodes } from "@/lib/sample-identity";

export const runtime = "nodejs";

export async function GET() {
  await ensureAllHashCodes();

  const batches = await prisma.sampleBatch.findMany({
    include: {
      samples: {
        include: {
          detail: true
        },
        orderBy: {
          sequence: "asc"
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 30
  });

  return NextResponse.json({ batches });
}
