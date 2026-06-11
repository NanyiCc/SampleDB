import { SAMPLE_TYPES, formatDate, formatDateTime } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type PrintPageProps = {
  searchParams: Promise<{ ids?: string }> | { ids?: string };
};

export default async function PrintSamplesPage({ searchParams }: PrintPageProps) {
  const params = await searchParams;
  const ids =
    params.ids
      ?.split(",")
      .map((id) => id.trim().toUpperCase())
      .filter(Boolean) ?? [];

  const samples =
    ids.length > 0
      ? await prisma.sample.findMany({
          where: {
            id: {
              in: ids
            }
          },
          include: {
            detail: true
          }
        })
      : [];

  const order = new Map(ids.map((id, index) => [id, index]));
  samples.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return (
    <main className="print-page">
      <div className="print-actions">
        <PrintButton />
      </div>
      <section className="label-sheet">
        {samples.map((sample) => (
          <article className="sample-label" key={sample.id}>
            <strong>{sample.id}</strong>
            <span>{sample.name}</span>
            <small>
              {SAMPLE_TYPES[sample.type]} · 收样 {formatDate(sample.receivedAt)}
            </small>
            <small>入库 {formatDateTime(sample.storedAt)}</small>
          </article>
        ))}
      </section>
      <script
        dangerouslySetInnerHTML={{
          __html: "window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 300); });"
        }}
      />
    </main>
  );
}
