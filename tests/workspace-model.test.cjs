const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sampledb-model-"));
for (const name of ["domain", "workspace-model"]) {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "lib", `${name}.ts`),
    "utf8",
  );
  fs.writeFileSync(
    path.join(tmp, `${name}.js`),
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
  );
}
const m = require(path.join(tmp, "workspace-model.js"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("fixture label migration preserves user edits and experimental measurements", () => {
  const data = m.createDemoData();
  data.samples[0].detail.tissueSource = "肝组织（演示）";
  data.samples[0].hash = "DEMO0001";
  data.samples[0].detail.remark = "实验员补充的备注";
  data.samples[1].detail.tissueSource = "独立采样来源";
  data.runs[0].operator = "演示实验员";
  data.runs[0].values.remark = "用户自定义 Demo 备注";
  const original = structuredClone(data);
  const next = m.refreshSeedLabels(data);
  assert.equal(next.samples[0].detail.tissueSource, "肝组织");
  assert.equal(next.samples[0].hash, "LAB00001");
  assert.equal(
    next.samples[0].detail.remark,
    original.samples[0].detail.remark,
  );
  assert.equal(next.samples[1].detail.tissueSource, "独立采样来源");
  assert.equal(next.runs[0].operator, "实验员");
  assert.deepEqual(next.runs[0].values, original.runs[0].values);
  assert.deepEqual(data, original);
  assert.deepEqual(m.refreshSeedLabels(next), next);
});

test("demo IDs are unique and every lineage resolves to its actual root sample", () => {
  const d = m.createDemoData();
  assert.equal(d.samples.length, 9);
  assert.equal(
    new Set([...d.samples, ...d.runs].map((r) => r.id)).size,
    d.samples.length + d.runs.length,
  );
  for (const r of d.runs) {
    const chain = m.lineageFor(r, d.runs);
    assert.equal(chain[0].sourceId, r.sampleId);
    assert.ok(d.samples.some((s) => s.id === r.sampleId));
    assert.equal(chain.at(-1).id, r.id);
    assert.ok(Number.isFinite(new Date(r.date).getTime()));
  }
});
test("missing data is not interpreted as zero and differences use the selected baseline", () => {
  assert.equal(m.numericDelta(null, 12), null);
  assert.equal(m.numericDelta("", 12), null);
  assert.equal(m.numericDelta("   ", 12), null);
  assert.equal(m.numericDelta("42 Gb", 12), null);
  assert.equal(m.numericDelta(0, 12), -12);
  assert.equal(m.numericDelta(12.4, 14.1), -1.7);
  assert.equal(m.numericDelta(14.1, 12.4), 1.7);
  assert.equal(m.sameMetric(null, 0), false);
});
test("registration fallback input is used only with compatible units", () => {
  const run = { values: {}, inputAmount: 5, inputUnit: "µL" };
  const libraryInput = m
    .metricsFor("LIBRARY")
    .find((m) => m.key === "inputAmount");
  const arrayInput = m.metricsFor("ARRAY").find((m) => m.key === "inputAmount");
  assert.equal(m.metricValue(run, libraryInput), null);
  assert.equal(m.metricValue(run, arrayInput), 5);
  assert.equal(
    m.metricValue({ ...run, values: { inputAmount: 0 } }, arrayInput),
    0,
  );
});
test("new registration IDs increment within source and experiment type", () => {
  const d = m.createDemoData();
  assert.equal(
    m.nextDerivedId("LAB01-0012", "ENRICHMENT", d.runs),
    "LAB01-0012-T02",
  );
  assert.equal(
    m.nextDerivedId("LAB01-0012", "LIBRARY", d.runs),
    "LAB01-0012-LIB01",
  );
});
test("lineage terminates for malformed cyclic input", () => {
  const runs = [
    { id: "a", sourceId: "b" },
    { id: "b", sourceId: "a" },
  ];
  assert.equal(m.lineageFor(runs[0], runs).length, 2);
});
test("CSV quotes multiline content, preserves missing markers, and neutralizes spreadsheet formulas", () => {
  assert.equal(m.csvCell('a,"b"\nc'), '"a,""b""\nc"');
  assert.equal(m.csvCell("=1+1"), '"\'=1+1"');
  const runs = m
    .createDemoData()
    .runs.filter((r) => r.type === "LIBRARY" && r.status === "submitted");
  const csv = m.comparisonCsv(runs, runs[0].id);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("未记录"));
  assert.ok(csv.includes("（基准）"));
});
test("live adapter follows full ancestry and keeps pooled sequencing attribution", () => {
  const raw = {
    samples: [
      {
        id: "P-0001",
        name: "cDNA",
        type: "CDNA",
        projectCode: "P",
        receivedAt: "2026-10-01",
        detail: {},
      },
    ],
    registrations: [
      {
        id: 1,
        experimentType: "LIBRARY",
        registeredAt: "2026-10-01",
        operator: "A",
        entries: [
          {
            sourceSampleId: "P-0001",
            inputAmount: 100,
            inputUnit: "ng",
            derivedSample: {
              id: "P-0001-LIB01",
              result: {
                id: 1,
                submittedAt: "2026-10-01",
                concentration: 10,
                remark: "preserve me",
              },
            },
          },
        ],
      },
      {
        id: 2,
        experimentType: "SEQUENCING",
        registeredAt: "2026-10-02",
        operator: "B",
        sequencingResult: {
          id: 2,
          dataAmount: "42 Gb",
          submittedAt: "2026-10-02",
        },
        entries: [
          {
            sourceSampleId: "P-0001-LIB01",
            derivedSample: { id: "P-0001-LIB01-SEQ01" },
          },
        ],
      },
    ],
  };
  const d = m.fromApi(raw);
  assert.equal(d.runs[1].sampleId, "P-0001");
  assert.equal(d.runs[1].registrationId, 2);
  assert.equal(d.runs[1].values.dataAmount, "42 Gb");
  assert.equal(d.runs[0].values.remark, "preserve me");
  assert.equal(d.runs[0].status, "submitted");
  assert.equal(
    m.metricsFor("SEQUENCING").find((m) => m.key === "dataAmount").numeric,
    undefined,
  );
});
