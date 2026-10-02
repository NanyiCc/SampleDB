import {
  EXPERIMENT_CONFIG,
  type ExperimentType,
  type SampleType,
} from "./domain";

export type Values = Record<string, string | number | null>;
export type WorkspaceSample = {
  id: string;
  name: string;
  type: SampleType;
  project: string;
  tube: string;
  hash: string;
  location: string;
  receivedAt: string;
  detail: Values;
};
export type WorkspaceRun = {
  id: string;
  sampleId: string;
  sourceId: string;
  type: ExperimentType;
  title: string;
  status: "pending" | "draft" | "submitted";
  date: string;
  operator: string;
  inputAmount: number | null;
  inputUnit: string;
  values: Values;
  registrationId?: number;
  source: "demo-manual" | "legacy";
};
export type ComparisonSnapshot = {
  id: string;
  name: string;
  date: string;
  baseline: string;
  runs: WorkspaceRun[];
};
export type ValidationPlan = {
  id: string;
  title: string;
  date: string;
  goal: string;
  bounds: string;
  hypothesis: string;
  baseline: string;
  runs: WorkspaceRun[];
  status: "draft";
};
export type WorkspaceData = {
  version: 1;
  samples: WorkspaceSample[];
  runs: WorkspaceRun[];
  comparisons: ComparisonSnapshot[];
  plans: ValidationPlan[];
};
export type Metric = {
  key: string;
  label: string;
  unit?: string;
  group: "输入参数" | "实验结果";
  numeric?: boolean;
};
const result = (key: string, label: string, unit?: string): Metric => ({
  key,
  label,
  unit,
  group: "实验结果",
  numeric: true,
});
const parameter = (key: string, label: string, unit?: string): Metric => ({
  key,
  label,
  unit,
  group: "输入参数",
  numeric: Boolean(unit),
});
export function metricsFor(type: ExperimentType): Metric[] {
  if (type === "SEQUENCING")
    return [
      parameter("sequencingStrategy", "测序策略"),
      { key: "dataAmount", label: "登记单总数据量", group: "实验结果" },
      { key: "uploadPath", label: "数据路径", group: "实验结果" },
    ];
  if (type === "SINGLE_CELL")
    return [
      parameter("loadingVolume", "上机体积", "µL"),
      parameter("loadingCellCount", "上机细胞数", "个"),
      result("viability", "细胞活率", "%"),
      result("cellConcentrationDirect", "细胞浓度", "个/µL"),
      result("libraryConcentration", "文库浓度", "ng/µL"),
      result("libraryFragmentLength", "文库片段", "bp"),
    ];
  if (type === "TISSUE_SECTION")
    return [
      parameter("sliceCount", "切片张数", "张"),
      { key: "sliceDetails", label: "切片明细", group: "实验结果" },
    ];
  if (type === "SECTION_PLACEMENT")
    return [
      parameter("chipId", "芯片 ID"),
      { key: "qc", label: "QC 记录", group: "实验结果" },
      { key: "imageStorageLocation", label: "图像路径", group: "实验结果" },
    ];
  const parameters =
    type === "ARRAY"
      ? [
          parameter("inputAmount", "上样量", "µL"),
          parameter("generationStrategy", "生成策略"),
        ]
      : type === "LIBRARY"
        ? [
            parameter("inputAmount", "投入量", "ng"),
            parameter("libraryStrategy", "建库策略"),
            parameter("libraryDuration", "建库时间"),
          ]
        : type === "LIGATION"
          ? [
              parameter("inputAmount", "投入量", "ng"),
              parameter("experimentMethod", "实验方式"),
            ]
          : [parameter("experimentMethod", "实验方式")];
  return [
    ...parameters,
    result("concentration", type === "LIBRARY" ? "文库浓度" : "浓度", "ng/µL"),
    result(type === "LIGATION" ? "outputVolume" : "volume", "体积", "µL"),
    result(
      type === "CDNA_PREP" ? "fragmentLength" : "fragmentDistribution",
      "片段均值",
      "bp",
    ),
    ...(type === "LIBRARY"
      ? [
          result("absorbance260280", "A260/280"),
          result("absorbance260230", "A260/230"),
        ]
      : []),
  ];
}
export function metricValue(
  run: WorkspaceRun,
  metric: Metric,
): string | number | null {
  const value = run.values[metric.key];
  if (value !== null && value !== undefined && value !== "") return value;
  if (metric.key === "inputAmount" && run.inputUnit === metric.unit)
    return run.inputAmount;
  return null;
}
export function numericDelta(
  value: string | number | null,
  base: string | number | null,
): number | null {
  if (
    value === null ||
    base === null ||
    String(value).trim() === "" ||
    String(base).trim() === ""
  )
    return null;
  const a = Number(value),
    b = Number(base);
  return Number.isFinite(a) && Number.isFinite(b)
    ? Math.round((a - b) * 10000) / 10000
    : null;
}
export function sameMetric(
  a: string | number | null,
  b: string | number | null,
) {
  return a === null || b === null ? a === b : String(a) === String(b);
}
export function lineageFor(
  run: WorkspaceRun,
  runs: WorkspaceRun[],
): WorkspaceRun[] {
  const path: WorkspaceRun[] = [],
    seen = new Set<string>();
  let cursor: WorkspaceRun | undefined = run;
  while (cursor && !seen.has(cursor.id)) {
    path.unshift(cursor);
    seen.add(cursor.id);
    cursor = runs.find((item) => item.id === cursor?.sourceId);
  }
  return path;
}
export function nextDerivedId(
  source: string,
  type: ExperimentType,
  runs: WorkspaceRun[],
) {
  const prefix = `${source}-${EXPERIMENT_CONFIG[type].suffix}`;
  const numbers = runs
    .filter((r) => r.sourceId === source && r.type === type)
    .map((r) => Number(r.id.slice(prefix.length)))
    .filter(Number.isFinite);
  return `${prefix}${String(Math.max(0, ...numbers) + 1).padStart(2, "0")}`;
}
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function comparisonCsv(runs: WorkspaceRun[], baseline: string) {
  if (!runs.length) return "";
  const rows: unknown[][] = [
    [
      "指标",
      "单位",
      ...runs.map((r) => `${r.id}${r.id === baseline ? "（基准）" : ""}`),
    ],
  ];
  metricsFor(runs[0].type).forEach((m) =>
    rows.push([
      m.label,
      m.unit ?? "",
      ...runs.map((r) => metricValue(r, m) ?? "未记录"),
    ]),
  );
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function createDemoData(): WorkspaceData {
  const samples: WorkspaceSample[] = [
    ["LAB01", 12, "CDNA", "肝组织 cDNA · A"],
    ["LAB01", 13, "CDNA", "肝组织 cDNA · B"],
    ["LAB01", 14, "CDNA", "肝组织 cDNA · C"],
    ["LAB01", 15, "CDNA", "肝组织 cDNA · D"],
    ["LAB01", 16, "TISSUE", "组织切片研究"],
    ["LAB02", 1, "WHOLE_BLOOD", "外周血样本"],
    ["LAB02", 2, "PLASMA", "血浆样本"],
    ["LAB02", 3, "CELL", "单细胞建库研究"],
    ["LAB03", 1, "TISSUE", "空间转录组样本"],
  ].map(([project, sequence, type, name], i) => ({
    id: `${project}-${String(sequence).padStart(4, "0")}`,
    name: String(name),
    type: type as SampleType,
    project: String(project),
    tube: `T-${String(i + 12).padStart(4, "0")}`,
    hash: `LAB0${String(i + 1).padStart(4, "0")}`,
    location: `${i < 5 ? "A" : "B"}区-02架`,
    receivedAt: "2026-09-25T09:00:00+08:00",
    detail: {
      volume: 30,
      concentration: 18.6,
      tissueSource:
        i < 5 ? "肝组织" : ["外周血", "外周血", "细胞悬液", "组织切片"][i - 5],
      storageCondition: "-80℃冰箱",
      remark: "按项目分组保存，实验记录关联至原始样本。",
    },
  }));
  const runs: WorkspaceRun[] = [];
  function add(
    sample: WorkspaceSample,
    sourceId: string,
    type: ExperimentType,
    day: number,
    values: Values,
    status: WorkspaceRun["status"] = "submitted",
  ) {
    const id = nextDerivedId(sourceId, type, runs);
    runs.push({
      id,
      sourceId,
      sampleId: sample.id,
      type,
      title: `${EXPERIMENT_CONFIG[type].shortLabel} · ${sample.id}`,
      status,
      date: `2026-${day > 30 ? "10" : "09"}-${String(day > 30 ? day - 30 : day).padStart(2, "0")}T09:20:00+08:00`,
      operator: "实验员",
      inputAmount: 100,
      inputUnit: "ng",
      values,
      source: "demo-manual",
    });
    return id;
  }
  samples.slice(0, 4).forEach((sample, i) => {
    let source = add(sample, sample.id, "ENRICHMENT", 26, {
      concentration: 8.6 + i,
      volume: 25,
      fragmentDistribution: "1250",
      experimentMethod: "FS 富集",
    });
    source = add(sample, source, "ARRAY", 27, {
      concentration: 12.2 + i,
      volume: 20,
      fragmentDistribution: "1500",
      inputAmount: 5,
      generationStrategy: "15连",
    });
    source = add(sample, source, "LIGATION", 28, {
      inputAmount: 100,
      outputVolume: 20,
      concentration: 16 + i,
      fragmentDistribution: "1450",
    });
    source = add(
      sample,
      source,
      "LIBRARY",
      29,
      i === 0
        ? { inputAmount: 100, libraryStrategy: "策略 A", volume: 20 }
        : {
            inputAmount: 100,
            libraryStrategy: i === 3 ? "策略 B" : "策略 A",
            volume: i === 3 ? 25 : 20,
            concentration: [0, 12.4, 14.1, 10.8][i],
            fragmentDistribution: [0, 420, 435, 418][i],
            absorbance260280: [0, 1.82, 1.85, 1.81][i],
            barcode: String(i),
          },
      i === 0 ? "draft" : "submitted",
    );
    if (i === 1)
      add(sample, source, "SEQUENCING", 30, {
        dataAmount: "42 Gb",
        uploadPath: "/sequencing/LAB01/FC026",
        sequencingStrategy: "PE150",
        remark: "登记单总量，不代表逐样本产出。",
      });
    if (i === 2) add(sample, source, "SEQUENCING", 31, {}, "pending");
  });
  let tissue = add(samples[4], samples[4].id, "TISSUE_SECTION", 28, {
    sliceCount: 2,
    sliceDetails:
      '[{"knifeCount":1,"thickness":10},{"knifeCount":1,"thickness":10}]',
  });
  tissue = add(samples[4], tissue, "SECTION_PLACEMENT", 29, {
    chipId: "SLIDE-S01",
    imageStorageLocation: "/images/slides/S01",
    qc: "形态记录待复核",
  });
  add(samples[4], tissue, "CDNA_PREP", 30, {
    volume: 20,
    concentration: 10.5,
    fragmentLength: "1200",
  });
  add(samples[7], samples[7].id, "SINGLE_CELL", 31, {
    viability: 92,
    cellConcentrationDirect: 850,
    loadingVolume: 5,
    libraryConcentration: 12.6,
    libraryFragmentLength: "430",
    loadingCellCount: "4250",
    cellCountInstrument: "细胞计数仪",
  });
  add(samples[8], samples[8].id, "TISSUE_SECTION", 32, {}, "pending");
  return { version: 1, samples, runs, comparisons: [], plans: [] };
}

// Refresh only known fixture labels. Never replace arbitrary user-entered notes.
export function refreshSeedLabels(data: WorkspaceData): WorkspaceData {
  const fixture = createDemoData();
  const samples = data.samples.map((sample) => {
    const seed = fixture.samples.find((s) => s.id === sample.id);
    if (!seed) return sample;
    const detail = { ...sample.detail };
    if (
      detail.tissueSource === "肝组织（演示）" ||
      detail.tissueSource === "演示来源"
    )
      detail.tissueSource = seed.detail.tissueSource;
    if (detail.remark === "虚构 Demo 样本，仅供功能体验。")
      detail.remark = seed.detail.remark;
    return {
      ...sample,
      hash: /^DEMO\d{4}$/.test(sample.hash) ? seed.hash : sample.hash,
      detail,
    };
  });
  function refreshRun(run: WorkspaceRun): WorkspaceRun {
    if (run.source !== "demo-manual") return run;
    const values = { ...run.values };
    const labels: Record<string, string> = {
      "/demo/LAB01/FC026": "/sequencing/LAB01/FC026",
      "/demo/slides/S01": "/images/slides/S01",
      "DEMO-S01": "SLIDE-S01",
      演示计数仪: "细胞计数仪",
      "演示登记单总量，不代表逐样本产出。": "登记单总量，不代表逐样本产出。",
    };
    for (const key of Object.keys(values)) {
      const value = values[key];
      if (typeof value === "string" && Object.hasOwn(labels, value))
        values[key] = labels[value];
    }
    return {
      ...run,
      operator: run.operator === "演示实验员" ? "实验员" : run.operator,
      values,
    };
  }
  return { ...data, samples, runs: data.runs.map(refreshRun) };
}

// Only the authenticated workspace endpoint supplies these records. Keep raw
// result fields so a partial editor never clears fields it does not display.
export function fromApi(payload: {
  samples: Array<Record<string, unknown>>;
  registrations: Array<Record<string, unknown>>;
}): WorkspaceData {
  const samples = payload.samples.map((s) => {
    const d = (s.detail ?? {}) as Values;
    return {
      id: String(s.id),
      name: String(s.name),
      type: s.type as SampleType,
      project: String(s.projectCode),
      tube: String(s.tubeId ?? ""),
      hash: String(s.hashCode ?? ""),
      location: String(d.storageLocation ?? ""),
      receivedAt: String(s.receivedAt),
      detail: d,
    };
  });
  const runs: WorkspaceRun[] = [];
  for (const registration of payload.registrations) {
    for (const entry of (registration.entries ?? []) as Array<
      Record<string, unknown>
    >) {
      const derived = entry.derivedSample as Record<string, unknown>;
      if (!derived) continue;
      const type = registration.experimentType as ExperimentType;
      const values = ((type === "SEQUENCING"
        ? registration.sequencingResult
        : derived.result) ?? {}) as Values;
      runs.push({
        id: String(derived.id),
        sourceId: String(entry.sourceSampleId),
        sampleId: "",
        type,
        title: String(registration.title || EXPERIMENT_CONFIG[type].label),
        status: values.submittedAt
          ? "submitted"
          : values.id
            ? "draft"
            : "pending",
        date: String(registration.registeredAt),
        operator: String(registration.operator),
        inputAmount:
          entry.inputAmount != null
            ? Number(entry.inputAmount)
            : entry.inputAmountNg != null
              ? Number(entry.inputAmountNg)
              : null,
        inputUnit: String(entry.inputUnit ?? "ng"),
        values,
        registrationId: Number(registration.id),
        source: "legacy",
      });
    }
  }
  runs.forEach((run) => {
    const path = lineageFor(run, runs);
    run.sampleId = path[0]?.sourceId ?? run.sourceId;
  });
  return { version: 1, samples, runs, comparisons: [], plans: [] };
}
