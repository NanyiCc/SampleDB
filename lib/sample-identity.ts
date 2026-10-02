import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeSampleId } from "@/lib/domain";
import { prisma } from "@/lib/prisma";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export type SampleIdentity = {
  id: string;
  hashCode: string | null;
  tubeId: string | null;
  kind: "BASE_SAMPLE" | "DERIVED_SAMPLE";
  projectCode: string | null;
  type?: string;
  experimentType?: string;
};

export function makeHashCode(seed: string, attempt = 0) {
  return createHash("sha1")
    .update(`${seed}:${attempt}`)
    .digest("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();
}

export async function generateUniqueHashCode(db: PrismaExecutor, seed: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const hashCode = makeHashCode(seed, attempt);
    const [sample, derivedSample] = await Promise.all([
      db.sample.findFirst({
        where: {
          hashCode
        },
        select: {
          id: true
        }
      }),
      db.derivedSample.findFirst({
        where: {
          hashCode
        },
        select: {
          id: true
        }
      })
    ]);

    if (!sample && !derivedSample) {
      return hashCode;
    }
  }

  throw new Error("HASH_CODE_COLLISION");
}

export async function ensureAllHashCodes() {
  await prisma.$transaction(async (tx) => {
    const samples = await tx.sample.findMany({
      where: {
        hashCode: null
      },
      select: {
        id: true
      }
    });

    for (const sample of samples) {
      await tx.sample.update({
        where: {
          id: sample.id
        },
        data: {
          hashCode: await generateUniqueHashCode(tx, sample.id)
        }
      });
    }

    const derivedSamples = await tx.derivedSample.findMany({
      where: {
        hashCode: null
      },
      select: {
        id: true
      }
    });

    for (const sample of derivedSamples) {
      await tx.derivedSample.update({
        where: {
          id: sample.id
        },
        data: {
          hashCode: await generateUniqueHashCode(tx, sample.id)
        }
      });
    }
  });
}

export async function resolveSampleIdentity(
  db: PrismaExecutor,
  value: string,
  options: { tubeOnly?: boolean } = {}
): Promise<SampleIdentity | null> {
  const normalized = normalizeSampleId(value);

  if (!normalized) {
    return null;
  }

  const baseSample = await db.sample.findFirst({
    where: {
      OR: [
        ...(options.tubeOnly ? [] : [{ id: normalized }, { hashCode: normalized }]),
        {
          tubeId: normalized
        }
      ]
    },
    select: {
      id: true,
      hashCode: true,
      tubeId: true,
      projectCode: true,
      type: true
    }
  });

  if (baseSample) {
    return {
      id: baseSample.id,
      hashCode: baseSample.hashCode,
      tubeId: baseSample.tubeId,
      kind: "BASE_SAMPLE",
      projectCode: baseSample.projectCode,
      type: baseSample.type
    };
  }

  if (options.tubeOnly) {
    return null;
  }

  const derivedSample = await db.derivedSample.findFirst({
    where: {
      OR: [
        {
          id: normalized
        },
        {
          hashCode: normalized
        }
      ]
    },
    select: {
      id: true,
      hashCode: true,
      sourceSampleId: true,
      experimentType: true
    }
  });

  if (!derivedSample) {
    return null;
  }

  return {
    id: derivedSample.id,
    hashCode: derivedSample.hashCode,
    tubeId: null,
    kind: "DERIVED_SAMPLE",
    projectCode: await resolveProjectCode(db, derivedSample.sourceSampleId),
    experimentType: derivedSample.experimentType
  };
}

export async function resolveProjectCode(db: PrismaExecutor, sampleId: string) {
  const seen = new Set<string>();
  let cursor = normalizeSampleId(sampleId);

  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const baseSample = await db.sample.findUnique({
      where: {
        id: cursor
      },
      select: {
        projectCode: true
      }
    });

    if (baseSample) {
      return baseSample.projectCode;
    }

    const derivedSample = await db.derivedSample.findUnique({
      where: {
        id: cursor
      },
      select: {
        sourceSampleId: true
      }
    });

    if (!derivedSample) {
      return null;
    }

    cursor = derivedSample.sourceSampleId;
  }

  return null;
}
