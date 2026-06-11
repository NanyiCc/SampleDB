"use client";

import {
  type CSSProperties,
  type Dispatch,
  type ElementType,
  FormEvent,
  type SetStateAction,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  ClipboardList,
  Database,
  Download,
  Edit3,
  FileSearch,
  FlaskConical,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2
} from "lucide-react";
import {
  EXPERIMENT_CONFIG,
  ExperimentType,
  SAMPLE_TYPES,
  SampleType,
  formatDate,
  formatDateTime
} from "@/lib/domain";

type SampleDetail = {
  volume: number | null;
  concentration: number | null;
  storageLocation: string | null;
  tissueSource: string | null;
  technologyType: string | null;
  originalFragmentDistribution: string | null;
  experimentMethod: string | null;
  loadingVolume: number | null;
  remark: string | null;
};

type SampleBatch = {
  id: number;
  projectCode: string;
  name: string;
  createdBy: string | null;
  count: number;
  createdAt: string;
  samples?: Sample[];
};

type Sample = {
  id: string;
  hashCode: string | null;
  batchId: number | null;
  projectCode: string;
  sequence: number;
  name: string;
  receivedAt: string;
  storedAt: string;
  type: SampleType;
  remark: string | null;
  detail: SampleDetail | null;
  batch?: SampleBatch | null;
};

type ExperimentResult = {
  id: number;
  derivedSampleId: string;
  experimentType: ExperimentType;
  volume: number | null;
  concentration: number | null;
  storageLocation: string | null;
  fragmentDistribution: string | null;
  experimentMethod: string | null;
  generationStrategy: string | null;
  inputAmount: number | null;
  outputVolume: number | null;
  libraryDuration: string | null;
  libraryStrategy: string | null;
  absorbance260280: number | null;
  absorbance260230: number | null;
  barcode: string | null;
  sliceCount: number | null;
  sliceDetails: string | null;
  chipId: string | null;
  imageStorageLocation: string | null;
  qc: string | null;
  fragmentLength: string | null;
  remark: string | null;
  submittedAt: string | null;
};

type DerivedSample = {
  id: string;
  hashCode: string | null;
  sourceSampleId: string;
  experimentType: ExperimentType;
  suffix: string;
  sequence: number;
  createdAt: string;
  result: ExperimentResult | null;
};

type RegistrationEntry = {
  id: number;
  sourceSampleId: string;
  inputAmountNg: number;
  derivedSampleId: string;
  sourceSample: Sample | null;
  sourceDerivedSample?: DerivedSample | null;
  sourceName?: string;
  derivedSample: DerivedSample;
};

type Registration = {
  id: number;
  title: string | null;
  projectCode: string | null;
  experimentType: ExperimentType;
  operator: string;
  remark: string | null;
  chipNumber: string | null;
  sequencingStrategy: string | null;
  storagePath: string | null;
  sequencingResult: SequencingResult | null;
  registeredAt: string;
  entries: RegistrationEntry[];
};

type SequencingResult = {
  id: number;
  registrationId: number;
  dataAmount: string | null;
  uploadPath: string | null;
  sequencingStrategy: string | null;
  barcode: number | null;
  remark: string | null;
  submittedAt: string | null;
};

type DraftSample = {
  id: string;
  projectCode: string;
  name: string;
  receivedAt: string;
  type: SampleType;
  remark: string;
  detail: {
    volume: string;
    concentration: string;
    storageLocation: string;
    tissueSource: string;
    technologyType: string;
    originalFragmentDistribution: string;
    experimentMethod: string;
    loadingVolume: string;
    remark: string;
  };
};

type QueryPayload = {
  query: string;
  requestedQuery?: string;
  kind: "BASE_SAMPLE" | "DERIVED_SAMPLE";
  current: Record<string, unknown>;
  rootSample: Sample | null;
  upstream: Array<Record<string, unknown>>;
  relatedSteps: QueryStep[];
  downstream: QueryStep[];
  sequencingRegistrations: Registration[];
};

type QueryStep = {
  id: string;
  hashCode: string | null;
  sourceSampleId: string;
  experimentType: string;
  createdAt: string;
  result: ExperimentResult | null;
  registration: Registration | null;
  inputAmountNg: number | null;
};

type SearchCandidate = {
  id: string;
  hashCode: string | null;
  kind: "BASE_SAMPLE" | "DERIVED_SAMPLE";
  label: string;
  createdAt: string;
  submittedAt?: string | null;
};

type ProjectSummary = {
  code: string;
  createdAt: string;
  updatedAt: string;
  sampleCount: number;
  batchCount: number;
};

type ProjectDetailSample = Sample & {
  typeLabel: string;
  downstreamCount: number;
  submittedDownstreamCount: number;
  downstream: Array<{
    id: string;
    hashCode: string | null;
    experimentType: ExperimentType;
    experimentLabel: string;
    createdAt: string;
    submittedAt: string | null;
    registrationId: number | null;
  }>;
};

type ProjectDetailPayload = {
  project: {
    code: string;
    createdAt: string;
    updatedAt: string;
  };
  samples: ProjectDetailSample[];
};

type ManualEditStep = DerivedSample & {
  label: string;
};

type ManualEditPayload = {
  query: string;
  current: {
    kind: "BASE_SAMPLE" | "DERIVED_SAMPLE";
    sample: Sample | (DerivedSample & { entry?: { registration?: Registration } | null }) | null;
  };
  rootSample: Sample | null;
  upstreamSteps: ManualEditStep[];
};

type AvailableSample = {
  id: string;
  hashCode: string | null;
  name: string;
  typeLabel: string;
  sourceLabel: string;
  projectCode: string | null;
  createdAt: string;
};

type ResolvedSample = {
  id: string;
  hashCode: string | null;
  kind: "BASE_SAMPLE" | "DERIVED_SAMPLE";
  projectCode: string | null;
  label: string;
};

type ExperimentRulePayload = {
  rules: Array<{
    sampleId?: string;
    sampleIdPrefix?: string;
    allowedExperiments: ExperimentType[];
    allowedLabels: string[];
    note?: string;
  }>;
  path: string;
  loadedAt: string;
  error: string | null;
};

type FieldConfig = {
  key: keyof ResultFormState | keyof DraftSample["detail"] | keyof SequencingResultFormState;
  label: string;
  type: "text" | "number" | "integer" | "select" | "combobox" | "textarea";
  unit?: string;
  required?: boolean;
  options?: string[];
  optionSource?: "storageLocations";
};

type LabFormConfig = {
  version: number;
  storageLocations: string[];
  sampleIntakeFields: FieldConfig[];
  experimentResultFields: Record<ExperimentType, FieldConfig[]>;
  sequencingResultFields: FieldConfig[];
  hideStorageLocationForExperiments: ExperimentType[];
  path: string;
  loadedAt: string;
  error: string | null;
};

type Message = {
  type: "success" | "error";
  text: string;
} | null;

type PageKey = "inventory" | "sampling" | "experiments" | "query" | "edit";

const today = () => new Date().toISOString().slice(0, 10);
const VOLUME_LABEL = "体积 (µL)";
const CONCENTRATION_LABEL = "浓度 (ng/µL)";
const OUTPUT_VOLUME_LABEL = "产出体积 (µL)";
const ORIGINAL_FRAGMENT_MEAN_LABEL = "原始片段均值 (bp)";
const FRAGMENT_MEAN_LABEL = "片段均值 (bp)";
const INPUT_MASS_LABEL = "投入量 (ng)";
const SAMPLING_MASS_LABEL = "上样量 (ng)";

const blankDetail = {
  volume: "",
  concentration: "",
  storageLocation: "",
  tissueSource: "",
  technologyType: "",
  originalFragmentDistribution: "",
  experimentMethod: "",
  loadingVolume: "",
  remark: ""
};

const defaultLabFormConfig: LabFormConfig = {
  version: 1,
  storageLocations: ["-80冰箱A1", "-20冰箱B1", "4度冰箱C1", "常温样本柜D1"],
  sampleIntakeFields: [
    { key: "volume", label: "体积", type: "number", unit: "µL" },
    { key: "concentration", label: "浓度", type: "number", unit: "ng/µL" },
    { key: "storageLocation", label: "储存位置", type: "combobox", optionSource: "storageLocations" },
    { key: "tissueSource", label: "所属组织", type: "text" },
    { key: "originalFragmentDistribution", label: "原始片段均值", type: "integer", unit: "bp" }
  ],
  experimentResultFields: {
    ENRICHMENT: [
      { key: "volume", label: "体积", type: "number", unit: "µL" },
      { key: "concentration", label: "浓度", type: "number", unit: "ng/µL" },
      { key: "storageLocation", label: "储存位置", type: "combobox", optionSource: "storageLocations" },
      { key: "fragmentDistribution", label: "片段均值", type: "integer", unit: "bp" },
      { key: "experimentMethod", label: "实验方式", type: "text" }
    ],
    ARRAY: [
      { key: "volume", label: "体积", type: "number", unit: "µL" },
      { key: "concentration", label: "浓度", type: "number", unit: "ng/µL" },
      { key: "storageLocation", label: "储存位置", type: "combobox", optionSource: "storageLocations" },
      { key: "fragmentDistribution", label: "片段均值", type: "integer", unit: "bp" },
      { key: "generationStrategy", label: "生成策略", type: "select", options: ["15连", "16连"] },
      { key: "experimentMethod", label: "实验方式", type: "text" },
      { key: "inputAmount", label: "上样量", type: "number", unit: "µL" }
    ],
    LIGATION: [
      { key: "inputAmount", label: "投入量", type: "number", unit: "ng" },
      { key: "outputVolume", label: "产出体积", type: "number", unit: "µL" },
      { key: "concentration", label: "浓度", type: "number", unit: "ng/µL" },
      { key: "storageLocation", label: "储存位置", type: "combobox", optionSource: "storageLocations" },
      { key: "fragmentDistribution", label: "片段均值", type: "integer", unit: "bp" },
      { key: "experimentMethod", label: "实验方式", type: "text" }
    ],
    LIBRARY: [
      { key: "inputAmount", label: "投入量", type: "number", unit: "ng" },
      { key: "libraryDuration", label: "建库时间", type: "text" },
      { key: "libraryStrategy", label: "建库策略", type: "text" },
      { key: "volume", label: "体积", type: "number", unit: "µL" },
      { key: "concentration", label: "浓度", type: "number", unit: "ng/µL" },
      { key: "storageLocation", label: "储存位置", type: "combobox", optionSource: "storageLocations" },
      { key: "fragmentDistribution", label: "片段均值", type: "integer", unit: "bp" },
      { key: "absorbance260280", label: "A260/280", type: "number" },
      { key: "absorbance260230", label: "A260/230", type: "number" },
      { key: "barcode", label: "Barcode", type: "text" }
    ],
    SEQUENCING: [],
    TISSUE_SECTION: [],
    SECTION_PLACEMENT: [
      { key: "chipId", label: "芯片 ID", type: "text", required: true },
      { key: "imageStorageLocation", label: "图像存储位置", type: "text" },
      { key: "qc", label: "QC", type: "textarea" }
    ],
    CDNA_PREP: [
      { key: "volume", label: "体积", type: "number", unit: "µL", required: true },
      { key: "concentration", label: "浓度", type: "number", unit: "ng/µL", required: true },
      { key: "fragmentLength", label: "片段长度", type: "integer", unit: "bp", required: true }
    ]
  },
  sequencingResultFields: [
    { key: "dataAmount", label: "测序下机数据量", type: "text" },
    { key: "uploadPath", label: "上传服务器路径", type: "text" },
    { key: "sequencingStrategy", label: "测序策略", type: "text" },
    {
      key: "barcode",
      label: "Barcode",
      type: "select",
      options: Array.from({ length: 16 }, (_, index) => String(index + 1))
    }
  ],
  hideStorageLocationForExperiments: ["SEQUENCING"],
  path: "",
  loadedAt: "",
  error: null
};

const navItems: Array<{ key: PageKey; label: string; icon: ElementType }> = [
  { key: "inventory", label: "样本入库", icon: Database },
  { key: "sampling", label: "取样登记", icon: ClipboardList },
  { key: "experiments", label: "实验回填", icon: FlaskConical },
  { key: "query", label: "样本查询", icon: FileSearch },
  { key: "edit", label: "数据修改", icon: Edit3 }
];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? "请求失败，请稍后重试。");
  }

  return payload as T;
}

function exportSamples(samples: Sample[]) {
  if (samples.length === 0) {
    return;
  }

  const ids = samples.map((sample) => sample.id).join(",");
  window.location.href = `/api/export/samples?ids=${encodeURIComponent(ids)}`;
}

function downloadDraftIdList(rows: DraftSample[]) {
  const bodyRows = rows
    .map(
      (row) => `<tr>
        <td>${row.id}</td>
        <td>${row.projectCode}</td>
        <td>${row.name}</td>
        <td>${SAMPLE_TYPES[row.type]}</td>
      </tr>`
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table>
    <tr><th>样本ID</th><th>项目ID</th><th>样本名称</th><th>样本类型</th></tr>${bodyRows}
  </table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `样本编号list_${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

function isSubmitted(entry: RegistrationEntry) {
  return Boolean(entry.derivedSample.result?.submittedAt);
}

function isSequencingSubmitted(registration: Registration) {
  return Boolean(registration.sequencingResult?.submittedAt);
}

function integerStringOrBlank(value: string | null | undefined) {
  return value && /^\d+$/.test(value) ? value : "";
}

function buildAvailableSamples(samples: Sample[], registrations: Registration[]) {
  const baseItems: AvailableSample[] = samples.map((sample) => ({
    id: sample.id,
    hashCode: sample.hashCode,
    name: sample.name,
    typeLabel: SAMPLE_TYPES[sample.type],
    sourceLabel: "入库样本",
    projectCode: sample.projectCode,
    createdAt: sample.storedAt
  }));
  const derivedItems: AvailableSample[] = registrations.flatMap((registration) =>
    registration.entries
      .filter(
        (entry) =>
          registration.experimentType !== "SEQUENCING" &&
          Boolean(entry.derivedSample.result?.submittedAt)
      )
      .map((entry) => ({
        id: entry.derivedSampleId,
        hashCode: entry.derivedSample.hashCode,
        name: entry.derivedSampleId,
        typeLabel: EXPERIMENT_CONFIG[entry.derivedSample.experimentType].shortLabel,
        sourceLabel: "实验回填",
        projectCode: registration.projectCode,
        createdAt: entry.derivedSample.result?.submittedAt ?? entry.derivedSample.createdAt
      }))
  );

  return [...baseItems, ...derivedItems]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);
}

export default function Home() {
  const [activePage, setActivePage] = useState<PageKey>("inventory");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [batches, setBatches] = useState<SampleBatch[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [labFormConfig, setLabFormConfig] = useState<LabFormConfig>(defaultLabFormConfig);
  const [generatedSamples, setGeneratedSamples] = useState<Sample[]>([]);
  const [generatedRegistration, setGeneratedRegistration] = useState<Registration | null>(null);
  const [activeRegistrationId, setActiveRegistrationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<Message>(null);

  async function refreshData() {
    setLoading(true);
    try {
      const [samplePayload, batchPayload, registrationPayload, configPayload] = await Promise.all([
        requestJson<{ samples: Sample[] }>("/api/samples"),
        requestJson<{ batches: SampleBatch[] }>("/api/sample-batches"),
        requestJson<{ registrations: Registration[] }>("/api/registrations"),
        requestJson<LabFormConfig>("/api/lab-form-config")
      ]);
      setSamples(samplePayload.samples);
      setBatches(batchPayload.batches);
      setRegistrations(registrationPayload.registrations);
      setLabFormConfig(configPayload);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "加载数据失败。" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    const readPageFromUrl = () => {
      const page = new URLSearchParams(window.location.search).get("page") as PageKey | null;
      if (page && navItems.some((item) => item.key === page)) {
        setActivePage(page);
      }
    };

    readPageFromUrl();
    window.addEventListener("popstate", readPageFromUrl);
    return () => window.removeEventListener("popstate", readPageFromUrl);
  }, []);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timer = window.setTimeout(() => {
      setMessage(null);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [message]);

  const pendingRegistrations = useMemo(
    () =>
      registrations
        .map((registration) => ({
          ...registration,
          entries:
            registration.experimentType === "SEQUENCING"
              ? registration.entries
              : registration.entries.filter((entry) => !isSubmitted(entry))
        }))
        .filter((registration) =>
          registration.experimentType === "SEQUENCING"
            ? !isSequencingSubmitted(registration)
            : registration.entries.length > 0
        ),
    [registrations]
  );
  const projectCodes = useMemo(
    () =>
      Array.from(
        new Set([...batches.map((batch) => batch.projectCode), ...samples.map((sample) => sample.projectCode)])
      ).sort((a, b) => a.localeCompare(b)),
    [batches, samples]
  );
  const availableSamples = useMemo(
    () => buildAvailableSamples(samples, registrations),
    [samples, registrations]
  );

  const activeRegistration = useMemo(
    () =>
      pendingRegistrations.find((registration) => registration.id === activeRegistrationId) ??
      pendingRegistrations[0] ??
      null,
    [activeRegistrationId, pendingRegistrations]
  );
  const pendingResultCount = pendingRegistrations.length;
  const completedResultCount = registrations.reduce(
    (total, registration) => {
      if (registration.experimentType === "SEQUENCING") {
        return total + (isSequencingSubmitted(registration) ? 1 : 0);
      }

      return total + registration.entries.filter((entry) => isSubmitted(entry)).length;
    },
    0
  );

  function switchPage(page: PageKey) {
    setActivePage(page);
    const url = new URL(window.location.href);
    url.searchParams.set("page", page);
    window.history.pushState({}, "", url);
  }

  return (
    <main className="app-shell">
      <header className="topbar app-topbar">
        <div>
          <p className="eyebrow">本机样本数据库</p>
          <h1>实验室样本管理系统</h1>
        </div>
        <button className="ghost-button" type="button" onClick={refreshData} disabled={loading}>
          <RefreshCw size={16} />
          刷新
        </button>
      </header>

      <nav className="page-nav" aria-label="主页面">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={activePage === item.key ? "active" : ""}
              key={item.key}
              type="button"
              onClick={() => switchPage(item.key)}
            >
              <Icon size={17} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {message ? <div className={`notice ${message.type}`}>{message.text}</div> : null}

      <section className="metric-row" aria-label="系统概览">
        <div>
          <span>入库样本</span>
          <strong>{samples.length}</strong>
        </div>
        <div>
          <span>入库批次</span>
          <strong>{batches.length}</strong>
        </div>
        <div>
          <span>待回填单数</span>
          <strong>{pendingResultCount}</strong>
        </div>
        <div>
          <span>已提交结果</span>
          <strong>{completedResultCount}</strong>
        </div>
      </section>

      {activePage === "inventory" ? (
        <InventoryPage
          batches={batches}
          generatedSamples={generatedSamples}
          onGenerated={setGeneratedSamples}
          onMessage={setMessage}
          onRefresh={refreshData}
          projectCodes={projectCodes}
          labFormConfig={labFormConfig}
        />
      ) : null}

      {activePage === "sampling" ? (
        <SamplingPage
          availableSamples={availableSamples}
          generatedRegistration={generatedRegistration}
          onGenerated={(registration) => {
            setGeneratedRegistration(registration);
            setActiveRegistrationId(registration.id);
          }}
          onMessage={setMessage}
          onRefresh={refreshData}
          onSwitchToExperiments={() => switchPage("experiments")}
        />
      ) : null}

      {activePage === "experiments" ? (
        <ExperimentsPage
          activeRegistration={activeRegistration}
          activeRegistrationId={activeRegistrationId}
          pendingRegistrations={pendingRegistrations}
          onMessage={setMessage}
          onRefresh={async () => {
            await refreshData();
            if (activeRegistration?.entries.length === 1) {
              setActiveRegistrationId(null);
            }
          }}
          onSelectRegistration={setActiveRegistrationId}
          labFormConfig={labFormConfig}
        />
      ) : null}

      {activePage === "query" ? <QueryPage onMessage={setMessage} /> : null}
      {activePage === "edit" ? (
        <ManualEditPage labFormConfig={labFormConfig} onMessage={setMessage} onRefresh={refreshData} />
      ) : null}

      <datalist id="array-strategy-options">
        <option value="15连" />
        <option value="16连" />
      </datalist>
      <datalist id="storage-location-options">
        {labFormConfig.storageLocations.map((location) => (
          <option key={location} value={location} />
        ))}
      </datalist>
    </main>
  );
}

function InventoryPage({
  batches,
  generatedSamples,
  onGenerated,
  onMessage,
  onRefresh,
  projectCodes,
  labFormConfig
}: {
  batches: SampleBatch[];
  generatedSamples: Sample[];
  onGenerated: (samples: Sample[]) => void;
  onMessage: (message: Message) => void;
  onRefresh: () => Promise<void>;
  projectCodes: string[];
  labFormConfig: LabFormConfig;
}) {
  const [generatorForm, setGeneratorForm] = useState({
    projectCode: "",
    count: "1",
    name: "",
    createdBy: "",
    receivedAt: today(),
    type: "CDNA" as SampleType,
    remark: ""
  });
  const [draftRows, setDraftRows] = useState<DraftSample[]>([]);
  const [projectFocused, setProjectFocused] = useState(false);
  const projectSuggestions = projectCodes
    .filter((code) => code.startsWith(generatorForm.projectCode) && code !== generatorForm.projectCode)
    .slice(0, 8);

  async function generateIds(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onMessage(null);
    try {
      const payload = await requestJson<{ ids: string[]; projectCode: string }>(
        `/api/samples/next-ids?projectCode=${encodeURIComponent(
          generatorForm.projectCode
        )}&count=${encodeURIComponent(generatorForm.count)}`
      );
      const rows = payload.ids.map((id) => ({
        id,
        projectCode: payload.projectCode,
        name: generatorForm.name,
        receivedAt: generatorForm.receivedAt,
        type: generatorForm.type,
        remark: generatorForm.remark,
        detail: { ...blankDetail }
      }));
      setDraftRows(rows);
      onMessage({ type: "success", text: `已生成 ${rows.length} 个样本编号，请在下方补全信息。` });
    } catch (error) {
      onMessage({ type: "error", text: error instanceof Error ? error.message : "编号生成失败。" });
    }
  }

  async function submitBatch() {
    onMessage(null);
    try {
      const payload = await requestJson<{ samples: Sample[] }>("/api/samples", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ createdBy: generatorForm.createdBy, samples: draftRows })
      });
      onGenerated(payload.samples);
      setDraftRows([]);
      await onRefresh();
      onMessage({ type: "success", text: `已完成 ${payload.samples.length} 个样本入库登记。` });
    } catch (error) {
      onMessage({ type: "error", text: error instanceof Error ? error.message : "样本入库失败。" });
    }
  }

  function updateDraft(index: number, patch: Partial<DraftSample>) {
    setDraftRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function updateDraftDetail(index: number, patch: Partial<DraftSample["detail"]>) {
    setDraftRows((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, detail: { ...row.detail, ...patch } } : row
      )
    );
  }

  return (
    <section className="workspace">
      <div className="section-title">
        <Database size={20} />
        <div>
          <h2>样本入库</h2>
          <p>先生成样本编号，再补全每个样本的信息并提交入库</p>
        </div>
      </div>

      <form className="form-grid generator-form" onSubmit={generateIds}>
        <label>
          项目 ID
          <div className="project-combobox">
            <input
              required
              maxLength={9}
              pattern="[A-Za-z0-9]{1,9}"
              placeholder="ABC 或 LAB01"
              value={generatorForm.projectCode}
              onBlur={() => window.setTimeout(() => setProjectFocused(false), 120)}
              onChange={(event) =>
                setGeneratorForm((current) => ({
                  ...current,
                  projectCode: event.target.value.toUpperCase()
                }))
              }
              onFocus={() => setProjectFocused(true)}
            />
            {projectFocused && projectSuggestions.length > 0 ? (
              <div className="project-suggestions">
                {projectSuggestions.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setGeneratorForm((current) => ({ ...current, projectCode: code }));
                      setProjectFocused(false);
                    }}
                  >
                    {code}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </label>
        <label>
          生成数量
          <input
            required
            min={1}
            max={200}
            type="number"
            value={generatorForm.count}
            onChange={(event) =>
              setGeneratorForm((current) => ({ ...current, count: event.target.value }))
            }
          />
        </label>
        <label>
          默认样本名称
          <input
            value={generatorForm.name}
            onChange={(event) =>
              setGeneratorForm((current) => ({ ...current, name: event.target.value }))
            }
          />
        </label>
        <label>
          入库人
          <input
            required
            value={generatorForm.createdBy}
            onChange={(event) =>
              setGeneratorForm((current) => ({ ...current, createdBy: event.target.value }))
            }
          />
        </label>
        <label>
          默认收样时间
          <input
            required
            type="date"
            value={generatorForm.receivedAt}
            onChange={(event) =>
              setGeneratorForm((current) => ({ ...current, receivedAt: event.target.value }))
            }
          />
        </label>
        <label>
          默认样本类型
          <select
            value={generatorForm.type}
            onChange={(event) =>
              setGeneratorForm((current) => ({
                ...current,
                type: event.target.value as SampleType
              }))
            }
          >
            {Object.entries(SAMPLE_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          默认备注
          <input
            value={generatorForm.remark}
            onChange={(event) =>
              setGeneratorForm((current) => ({ ...current, remark: event.target.value }))
            }
          />
        </label>
        <button className="primary-button span-2" type="submit">
          <Plus size={16} />
          生成样本编号
        </button>
      </form>

      {draftRows.length > 0 ? (
        <div className="draft-panel">
          <div className="toolbar-line">
            <strong>待填写样本信息</strong>
            <div>
              <button type="button" onClick={() => downloadDraftIdList(draftRows)}>
                <Download size={15} />
                下载样本编号 list
              </button>
              <button className="primary-button" type="button" onClick={submitBatch}>
                <Send size={15} />
                提交入库登记
              </button>
            </div>
          </div>

          <div className="draft-list">
            {draftRows.map((row, index) => (
              <article className="draft-card" key={row.id}>
                <div className="draft-card-head">
                  <strong>{row.id}</strong>
                  <span>第 {index + 1} 管</span>
                </div>
                <div className="form-grid">
                  <label>
                    样本名称
                    <input
                      value={row.name}
                      onChange={(event) => updateDraft(index, { name: event.target.value })}
                    />
                  </label>
                  <label>
                    收样时间
                    <input
                      required
                      type="date"
                      value={row.receivedAt}
                      onChange={(event) => updateDraft(index, { receivedAt: event.target.value })}
                    />
                  </label>
                  <label>
                    样本类型
                    <select
                      value={row.type}
                      onChange={(event) =>
                        updateDraft(index, { type: event.target.value as SampleType })
                      }
                    >
                      {Object.entries(SAMPLE_TYPES).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {row.type === "CDNA" ? (
                    labFormConfig.sampleIntakeFields.map((field) => (
                      <ConfiguredField
                        field={field}
                        key={field.key}
                        options={labFormConfig.storageLocations}
                        value={String(row.detail[field.key as keyof DraftSample["detail"]] ?? "")}
                        onChange={(value) =>
                          updateDraftDetail(index, {
                            [field.key]: value
                          } as Partial<DraftSample["detail"]>)
                        }
                      />
                    ))
                  ) : null}
                  <label className="span-2">
                    备注
                    <input
                      value={row.remark}
                      onChange={(event) => updateDraft(index, { remark: event.target.value })}
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {generatedSamples.length > 0 ? (
        <div className="generated-block">
          <div className="toolbar-line">
            <strong>最近完成入库</strong>
            <button type="button" onClick={() => exportSamples(generatedSamples)}>
              <Download size={15} />
              导出该批完整信息
            </button>
          </div>
          <div className="id-grid">
            {generatedSamples.map((sample) => (
              <span key={sample.id}>{sample.id}</span>
            ))}
          </div>
        </div>
      ) : null}

      <RecentBatches batches={batches} />
    </section>
  );
}

function SamplingPage({
  availableSamples,
  generatedRegistration,
  onGenerated,
  onMessage,
  onRefresh,
  onSwitchToExperiments
}: {
  availableSamples: AvailableSample[];
  generatedRegistration: Registration | null;
  onGenerated: (registration: Registration) => void;
  onMessage: (message: Message) => void;
  onRefresh: () => Promise<void>;
  onSwitchToExperiments: () => void;
}) {
  const [registrationForm, setRegistrationForm] = useState({
    experimentType: "ENRICHMENT" as ExperimentType,
    title: "",
    projectCode: "",
    operator: "",
    chipNumber: "",
    sequencingStrategy: "",
    storagePath: "",
    remark: "",
    entries: [{ sampleId: "", inputAmountNg: "" }]
  });
  const [rulePayload, setRulePayload] = useState<ExperimentRulePayload | null>(null);
  const [loadingRules, setLoadingRules] = useState(false);
  const [resolvedSource, setResolvedSource] = useState<ResolvedSample | null>(null);
  const isSequencing = registrationForm.experimentType === "SEQUENCING";

  async function loadRules(showMessage = false) {
    setLoadingRules(true);
    try {
      const payload = await requestJson<ExperimentRulePayload>("/api/experiment-rules");
      setRulePayload(payload);
      if (showMessage) {
        onMessage({
          type: payload.error ? "error" : "success",
          text: payload.error
            ? `实验限制配置读取失败：${payload.error}`
            : `已重载实验限制配置，共 ${payload.rules.length} 条规则。`
        });
      }
    } catch (error) {
      if (showMessage) {
        onMessage({ type: "error", text: error instanceof Error ? error.message : "重载实验限制失败。" });
      }
    } finally {
      setLoadingRules(false);
    }
  }

  useEffect(() => {
    loadRules();
  }, []);

  useEffect(() => {
    const firstInput = registrationForm.entries.find((entry) => entry.sampleId.trim().length > 0)?.sampleId.trim();
    if (!firstInput) {
      setResolvedSource(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const payload = await requestJson<{ sample: ResolvedSample }>(
          `/api/samples/resolve?q=${encodeURIComponent(firstInput)}`
        );
        setResolvedSource(payload.sample);
        setRegistrationForm((current) =>
          current.projectCode || !payload.sample.projectCode
            ? current
            : {
                ...current,
                projectCode: payload.sample.projectCode
              }
        );
      } catch {
        setResolvedSource(null);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [registrationForm.entries]);

  async function handleRegistrationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onMessage(null);

    try {
      const payload = await requestJson<{ registration: Registration }>("/api/registrations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(registrationForm)
      });

      onGenerated(payload.registration);
      setRegistrationForm((current) => ({
        ...current,
        title: "",
        chipNumber: "",
        sequencingStrategy: "",
        storagePath: "",
        remark: "",
        entries: [{ sampleId: "", inputAmountNg: "" }]
      }));
      await onRefresh();
      onMessage({
        type: "success",
        text:
          payload.registration.experimentType === "SEQUENCING"
            ? `测序上机登记 ${payload.registration.id} 已生成 ${payload.registration.entries.length} 个 SEQ 编号。`
            : `取样登记 ${payload.registration.id} 已生成 ${payload.registration.entries.length} 个派生编号。`
      });
    } catch (error) {
      onMessage({ type: "error", text: error instanceof Error ? error.message : "取样登记失败。" });
    }
  }

  return (
    <section className="workspace two-columns sampling-page">
      <div className="work-section">
        <div className="section-title">
          <ClipboardList size={20} />
          <div>
            <h2>取样登记</h2>
            <p>普通实验按样本生成派生编号；测序上机按芯片登记并生成 SEQ 编号</p>
          </div>
        </div>

        <form className="form-grid" onSubmit={handleRegistrationSubmit}>
          <label>
            登记标题
            <input
              placeholder="例如 组织切片-第一批"
              value={registrationForm.title}
              onChange={(event) =>
                setRegistrationForm((current) => ({
                  ...current,
                  title: event.target.value
                }))
              }
            />
          </label>
          <label>
            项目 ID
            <input
              placeholder="可自动识别，也可手动填写"
              value={registrationForm.projectCode}
              onChange={(event) =>
                setRegistrationForm((current) => ({
                  ...current,
                  projectCode: event.target.value.toUpperCase()
                }))
              }
            />
          </label>
          <label>
            参与实验
            <select
              value={registrationForm.experimentType}
              onChange={(event) =>
                setRegistrationForm((current) => ({
                  ...current,
                  experimentType: event.target.value as ExperimentType
                }))
              }
            >
              {Object.entries(EXPERIMENT_CONFIG).map(([value, config]) => (
                <option key={value} value={value}>
                  {config.label} ({config.suffix})
                </option>
              ))}
            </select>
          </label>
          <label>
            操作员
            <input
              required
              value={registrationForm.operator}
              onChange={(event) =>
                setRegistrationForm((current) => ({
                  ...current,
                  operator: event.target.value
                }))
              }
            />
          </label>
          {isSequencing ? (
            <>
              <label>
                芯片编号
                <input
                  required
                  placeholder="例如 CHIP-001"
                  value={registrationForm.chipNumber}
                  onChange={(event) =>
                    setRegistrationForm((current) => ({
                      ...current,
                      chipNumber: event.target.value.toUpperCase()
                    }))
                  }
                />
              </label>
              <label>
                测序策略
                <input
                  required
                  placeholder="例如 PE150"
                  value={registrationForm.sequencingStrategy}
                  onChange={(event) =>
                    setRegistrationForm((current) => ({
                      ...current,
                      sequencingStrategy: event.target.value
                    }))
                  }
                />
              </label>
              <label className="span-2">
                储存路径
                <input
                  placeholder="可选"
                  value={registrationForm.storagePath}
                  onChange={(event) =>
                    setRegistrationForm((current) => ({
                      ...current,
                      storagePath: event.target.value
                    }))
                  }
                />
              </label>
            </>
          ) : null}
          <label className="span-2">
            登记备注
            <textarea
              rows={2}
              value={registrationForm.remark}
              onChange={(event) =>
                setRegistrationForm((current) => ({
                  ...current,
                  remark: event.target.value
                }))
              }
            />
          </label>

          <div className="span-2 entry-editor">
            <div className="toolbar-line">
              <strong>{isSequencing ? "投入文库" : "取用样本"}</strong>
              <button
                type="button"
                onClick={() =>
                  setRegistrationForm((current) => ({
                    ...current,
                    entries: [...current.entries, { sampleId: "", inputAmountNg: "" }]
                  }))
                }
              >
                <Plus size={15} />
                {isSequencing ? "添加文库" : "添加"}
              </button>
            </div>
            {registrationForm.entries.map((entry, index) => (
              <div className="entry-row" key={index}>
                <input
                  required
                  placeholder={isSequencing ? "文库样本 ID 或短码" : "样本 ID 或短码"}
                  value={entry.sampleId}
                  onChange={(event) =>
                    setRegistrationForm((current) => ({
                      ...current,
                      entries: current.entries.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, sampleId: event.target.value.toUpperCase() }
                          : item
                      )
                    }))
                  }
                />
                <input
                  required
                  min={0}
                  step="0.01"
                  type="number"
                  placeholder={isSequencing ? INPUT_MASS_LABEL : SAMPLING_MASS_LABEL}
                  value={entry.inputAmountNg}
                  onChange={(event) =>
                    setRegistrationForm((current) => ({
                      ...current,
                      entries: current.entries.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, inputAmountNg: event.target.value }
                          : item
                      )
                    }))
                  }
                />
                <button
                  aria-label="删除取用样本"
                  className="icon-button"
                  disabled={registrationForm.entries.length === 1}
                  type="button"
                  onClick={() =>
                    setRegistrationForm((current) => ({
                      ...current,
                      entries: current.entries.filter((_, itemIndex) => itemIndex !== index)
                    }))
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {resolvedSource ? (
              <p className="muted-text">
                已解析：{resolvedSource.hashCode ? `${resolvedSource.hashCode} → ` : ""}
                {resolvedSource.id} · {resolvedSource.label}
                {resolvedSource.projectCode ? ` · 项目 ${resolvedSource.projectCode}` : ""}
              </p>
            ) : null}
          </div>

          <button className="primary-button span-2" type="submit">
            <Plus size={16} />
            {isSequencing ? "生成测序上机登记" : "生成取样登记"}
          </button>
        </form>
      </div>

      <div className="work-section">
        <div className="section-title">
          <FlaskConical size={20} />
          <div>
            <h2>登记输出</h2>
            <p>导出本次取样表，实验结束后到“实验回填”提交结果</p>
          </div>
        </div>

        {generatedRegistration ? (
          <div className="generated-block no-border">
            <div className="toolbar-line">
              <strong>{generatedRegistration.title || `登记 #${generatedRegistration.id}`}</strong>
              <div>
                <a href={`/api/export/registrations/${generatedRegistration.id}`}>
                  <Download size={15} />
                  导出取样登记
                </a>
                <button type="button" onClick={onSwitchToExperiments}>
                  <FlaskConical size={15} />
                  去回填
                </button>
              </div>
            </div>
            <div className="id-grid">
              {generatedRegistration.entries.map((entry) => (
                <span key={entry.derivedSampleId}>{entry.derivedSampleId}</span>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-panel">取样登记提交后会在这里显示派生编号。</div>
        )}

        <div className="sample-pick-list">
          <div className="toolbar-line">
            <strong>可取样样本</strong>
            <button disabled={loadingRules} type="button" onClick={() => loadRules(true)}>
              <RefreshCw size={15} />
              重载实验限制
            </button>
          </div>
          {rulePayload ? (
            <p className="muted-text">
              实验限制：{rulePayload.error ? "配置读取失败" : `${rulePayload.rules.length} 条规则`} ·{" "}
              {formatDateTime(rulePayload.loadedAt)}
            </p>
          ) : null}
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>样本 ID</th>
                  <th>短码</th>
                  <th>项目</th>
                  <th>来源</th>
                  <th>类型</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {availableSamples.map((sample) => (
                  <tr key={sample.id}>
                    <td className="mono">{sample.id}</td>
                    <td className="mono">{sample.hashCode ?? ""}</td>
                    <td>{sample.projectCode ?? ""}</td>
                    <td>{sample.sourceLabel}</td>
                    <td>{sample.typeLabel}</td>
                    <td>{formatDateTime(sample.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function ExperimentsPage({
  activeRegistration,
  activeRegistrationId,
  labFormConfig,
  pendingRegistrations,
  onSelectRegistration,
  onMessage,
  onRefresh
}: {
  activeRegistration: Registration | null;
  activeRegistrationId: number | null;
  labFormConfig: LabFormConfig;
  pendingRegistrations: Registration[];
  onSelectRegistration: (id: number | null) => void;
  onMessage: (message: Message) => void;
  onRefresh: () => Promise<void>;
}) {
  return (
    <section className="workspace result-workspace">
      <div className="registration-list">
        <div className="section-title inline-title">
          <ClipboardList size={20} />
          <div>
            <h2>正在实验等待回填</h2>
            <p>提交完成后，该表单会从这里移除，可在样本查询中追溯</p>
          </div>
        </div>

        <div className="card-list">
          {pendingRegistrations.map((registration) => {
            const config = EXPERIMENT_CONFIG[registration.experimentType];
            const isSequencing = registration.experimentType === "SEQUENCING";
            return (
              <button
                className={`registration-card ${
                  (activeRegistrationId ?? activeRegistration?.id) === registration.id ? "active" : ""
                }`}
                key={registration.id}
                type="button"
                onClick={() => onSelectRegistration(registration.id)}
                style={{ "--accent": config.accent } as CSSProperties}
              >
                <span>{config.shortLabel}</span>
                <strong>
                  {registration.title ||
                    (isSequencing ? `芯片 ${registration.chipNumber ?? registration.id}` : `登记 #${registration.id}`)}
                </strong>
                <small>
                  {isSequencing ? `登记 #${registration.id} · ` : ""}
                  {registration.projectCode ? `项目 ${registration.projectCode} · ` : ""}
                  {formatDateTime(registration.registeredAt)} · {registration.operator}
                </small>
                <em>{isSequencing ? "1 个下机结果待回填" : `${registration.entries.length} 个待回填`}</em>
              </button>
            );
          })}
          {pendingRegistrations.length === 0 ? (
            <div className="empty-panel">当前没有等待回填的实验。</div>
          ) : null}
        </div>
      </div>

      <div className="result-panel">
        {activeRegistration ? (
          <>
            <div className="toolbar-line result-heading">
              <div className="result-title-stack">
                <span className="result-registration-id">
                  登记 #{activeRegistration.id}
                  {activeRegistration.title ? ` · ${activeRegistration.title}` : ""}
                  {activeRegistration.projectCode ? ` · 项目 ${activeRegistration.projectCode}` : ""}
                  {activeRegistration.experimentType === "SEQUENCING" && activeRegistration.chipNumber
                    ? ` · 芯片 ${activeRegistration.chipNumber}`
                    : ""}
                </span>
                <h2>
                  {activeRegistration.experimentType === "SEQUENCING"
                    ? "测序下机"
                    : EXPERIMENT_CONFIG[activeRegistration.experimentType].label}
                </h2>
              </div>
              <a href={`/api/export/registrations/${activeRegistration.id}`}>
                <Download size={15} />
                导出取样登记
              </a>
            </div>

            {activeRegistration.experimentType === "SEQUENCING" ? (
              <SequencingRegistrationResultForm
                labFormConfig={labFormConfig}
                registration={activeRegistration}
                onDeleted={async () => {
                  await onRefresh();
                  onMessage({
                    type: "success",
                    text: `芯片 ${activeRegistration.chipNumber ?? activeRegistration.id} 的待回填表单已删除。`
                  });
                }}
                onSaved={async (mode) => {
                  await onRefresh();
                  onMessage({
                    type: "success",
                    text:
                      mode === "draft"
                        ? `芯片 ${activeRegistration.chipNumber ?? activeRegistration.id} 下机结果已暂存。`
                        : `芯片 ${activeRegistration.chipNumber ?? activeRegistration.id} 下机结果已提交。`
                  });
                }}
              />
            ) : (
              <div className="result-form-list">
                {activeRegistration.entries.map((entry) => (
                  <ResultForm
                    entry={entry}
                    key={entry.derivedSampleId}
                    labFormConfig={labFormConfig}
                    onDeleted={async () => {
                      await onRefresh();
                      onMessage({
                        type: "success",
                        text: `${entry.derivedSampleId} 的待回填表单已删除。`
                      });
                    }}
                    onSaved={async (mode) => {
                      await onRefresh();
                      onMessage({
                        type: "success",
                        text:
                          mode === "draft"
                            ? `${entry.derivedSampleId} 已暂存。`
                            : `${entry.derivedSampleId} 已提交，结果已回存。`
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="empty-panel">没有需要填写的实验结果。</div>
        )}
      </div>
    </section>
  );
}

function QueryPage({ onMessage }: { onMessage: (message: Message) => void }) {
  const [mode, setMode] = useState<"sample" | "project">("sample");
  const [queryId, setQueryId] = useState("");
  const [result, setResult] = useState<QueryPayload | null>(null);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [projectQuery, setProjectQuery] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectDetail, setProjectDetail] = useState<ProjectDetailPayload | null>(null);
  const [searching, setSearching] = useState(false);

  async function loadSample(sampleId: string) {
    onMessage(null);
    setSearching(true);
    try {
      const payload = await requestJson<QueryPayload>(
        `/api/query/${encodeURIComponent(sampleId.trim().toUpperCase())}`
      );
      setResult(payload);
      setCandidates([]);
      setQueryId(payload.query);
      setMode("sample");
    } catch (error) {
      setResult(null);
      try {
        const payload = await requestJson<{ samples: SearchCandidate[] }>(
          `/api/search/samples?q=${encodeURIComponent(sampleId.trim().toUpperCase())}`
        );
        setCandidates(payload.samples);
        if (payload.samples.length === 0) {
          onMessage({ type: "error", text: error instanceof Error ? error.message : "查询失败。" });
        }
      } catch {
        setCandidates([]);
        onMessage({ type: "error", text: error instanceof Error ? error.message : "查询失败。" });
      }
    } finally {
      setSearching(false);
    }
  }

  async function handleQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadSample(queryId);
  }

  async function loadProjects(query = projectQuery) {
    const payload = await requestJson<{ projects: ProjectSummary[] }>(
      `/api/projects?q=${encodeURIComponent(query.trim().toUpperCase())}`
    );
    setProjects(payload.projects);
  }

  async function loadProjectDetail(projectCode: string) {
    const payload = await requestJson<ProjectDetailPayload>(
      `/api/projects/${encodeURIComponent(projectCode)}`
    );
    setProjectDetail(payload);
  }

  useEffect(() => {
    loadProjects("");
  }, []);

  return (
    <section className="workspace query-page">
      <div className="section-title">
        <FileSearch size={20} />
        <div>
          <h2>样本查询</h2>
          <p>支持样本 ID 精确/包含查询，也可以按项目 ID 浏览原始样本和下游实验</p>
        </div>
      </div>

      <div className="segmented-control">
        <button className={mode === "sample" ? "active" : ""} type="button" onClick={() => setMode("sample")}>
          样本查询
        </button>
        <button className={mode === "project" ? "active" : ""} type="button" onClick={() => setMode("project")}>
          项目浏览
        </button>
      </div>

      {mode === "sample" ? (
        <>
          <form className="query-form" onSubmit={handleQuery}>
            <input
              required
              placeholder="例如 ABC-0001、ABC-0001-T01 或短码；也可输入 ABC 做包含查询"
              value={queryId}
              onChange={(event) => setQueryId(event.target.value.toUpperCase())}
            />
            <button className="primary-button" disabled={searching} type="submit">
              <FileSearch size={16} />
              查询
            </button>
          </form>

          {candidates.length > 0 ? (
            <article className="query-card">
              <h3>模糊匹配结果</h3>
              <div className="step-list">
                {candidates.map((candidate) => (
                  <div className="step-row" key={candidate.id}>
                    <div>
                      <strong className="mono">{candidate.id}</strong>
                      <span>
                        {candidate.hashCode ? `短码 ${candidate.hashCode} · ` : ""}
                        {candidate.label} · {formatDateTime(candidate.createdAt)}
                      </span>
                    </div>
                    <button type="button" onClick={() => loadSample(candidate.id)}>
                      查看链路
                    </button>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {result ? (
            <div className="query-result">
              <div className="query-summary">
                <div>
                  <span>当前样本</span>
                  <strong>{result.query}</strong>
                  {(result.current as { hashCode?: string | null }).hashCode ? (
                    <p>短码 {(result.current as { hashCode?: string | null }).hashCode}</p>
                  ) : null}
                  <p>{result.kind === "BASE_SAMPLE" ? "原始入库样本" : "实验派生样本"}</p>
                </div>
                <a href={`/api/export/query/${encodeURIComponent(result.query)}`}>
                  <Download size={15} />
                  导出查询结果
                </a>
                {result.rootSample?.batchId ? (
                  <a href={`/api/export/samples?batchId=${result.rootSample.batchId}`}>
                    <Download size={15} />
                    导出入库批次
                  </a>
                ) : null}
              </div>

              {result.rootSample ? <SampleSnapshot title="原始来源" sample={result.rootSample} /> : null}

              <QueryStepList title="相关实验步骤" steps={result.relatedSteps} onSelectSample={loadSample} />
              <QueryStepList title="该样本之后被取用的实验" steps={result.downstream} onSelectSample={loadSample} />
              <SequencingRegistrationList title="该样本参与的测序芯片" registrations={result.sequencingRegistrations} />
            </div>
          ) : candidates.length === 0 ? (
            <div className="empty-panel">请输入样本 ID 后查询。</div>
          ) : null}
        </>
      ) : (
        <div className="query-result">
          <form
            className="query-form"
            onSubmit={(event) => {
              event.preventDefault();
              loadProjects(projectQuery);
            }}
          >
            <input
              placeholder="输入项目 ID 片段，例如 LAB"
              value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value.toUpperCase())}
            />
            <button className="primary-button" type="submit">
              <FileSearch size={16} />
              筛选项目
            </button>
          </form>
          <div className="project-browser-grid">
            <article className="query-card">
              <h3>项目列表</h3>
              <div className="step-list">
                {projects.map((project) => (
                  <button
                    className="project-list-button"
                    key={project.code}
                    type="button"
                    onClick={() => loadProjectDetail(project.code)}
                  >
                    <strong className="mono">{project.code}</strong>
                    <span>{project.sampleCount} 个样本 · {project.batchCount} 个批次</span>
                  </button>
                ))}
                {projects.length === 0 ? <p className="muted-text">暂无项目</p> : null}
              </div>
            </article>

            <article className="query-card">
              <div className="toolbar-line">
                <h3>{projectDetail ? `项目 ${projectDetail.project.code}` : "项目详情"}</h3>
                {projectDetail ? (
                  <a href={`/api/export/projects/${encodeURIComponent(projectDetail.project.code)}`}>
                    <Download size={15} />
                    导出项目
                  </a>
                ) : null}
              </div>
              {projectDetail ? (
                <div className="table-wrap compact-table">
                  <table>
                    <thead>
                      <tr>
                        <th>样本 ID</th>
                        <th>短码</th>
                        <th>名称</th>
                        <th>类型</th>
                        <th>下游实验</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectDetail.samples.map((sample) => (
                        <tr key={sample.id}>
                          <td className="mono">{sample.id}</td>
                          <td className="mono">{sample.hashCode ?? ""}</td>
                          <td>{sample.name}</td>
                          <td>{sample.typeLabel}</td>
                          <td>
                            {sample.downstreamCount} 个，下游已提交 {sample.submittedDownstreamCount} 个
                            {sample.downstream.length > 0 ? (
                              <div className="mini-link-list">
                                {sample.downstream.slice(0, 5).map((item) => (
                                  <button key={item.id} type="button" onClick={() => loadSample(item.id)}>
                                    {item.hashCode ?? item.id}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </td>
                          <td>
                            <button type="button" onClick={() => loadSample(sample.id)}>
                              查看链路
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-panel">请选择一个项目。</div>
              )}
            </article>
          </div>
        </div>
      )}
    </section>
  );
}

function SequencingRegistrationResultForm({
  labFormConfig,
  registration,
  onDeleted,
  onSaved
}: {
  labFormConfig: LabFormConfig;
  registration: Registration;
  onDeleted: () => Promise<void>;
  onSaved: (mode: "draft" | "submit") => Promise<void>;
}) {
  const result = registration.sequencingResult;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SequencingResultFormState>({
    dataAmount: result?.dataAmount ?? "",
    uploadPath: result?.uploadPath ?? "",
    sequencingStrategy: result?.sequencingStrategy ?? registration.sequencingStrategy ?? "",
    barcode: result?.barcode?.toString() ?? "",
    remark: result?.remark ?? ""
  });

  useEffect(() => {
    setForm({
      dataAmount: result?.dataAmount ?? "",
      uploadPath: result?.uploadPath ?? "",
      sequencingStrategy: result?.sequencingStrategy ?? registration.sequencingStrategy ?? "",
      barcode: result?.barcode?.toString() ?? "",
      remark: result?.remark ?? ""
    });
  }, [registration.id, registration.sequencingStrategy, result]);

  async function save(mode: "draft" | "submit") {
    setSaving(true);
    try {
      await requestJson(`/api/registrations/${registration.id}/sequencing-result`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ...form, mode })
      });
      await onSaved(mode);
    } finally {
      setSaving(false);
    }
  }

  async function deleteForm() {
    if (!window.confirm("确认删除这张测序下机待回填表单吗？对应 SEQ 编号也会一并删除。")) {
      return;
    }

    setSaving(true);
    try {
      await requestJson(`/api/registrations/${registration.id}/sequencing-result`, {
        method: "DELETE"
      });
      await onDeleted();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="result-form"
      onSubmit={(event) => {
        event.preventDefault();
        save("submit");
      }}
    >
      <div className="result-form-head">
        <div>
          <span>{registration.entries.length} 个投入文库</span>
          <strong>{registration.chipNumber ?? `登记 #${registration.id}`}</strong>
        </div>
        <em>{result ? "已暂存" : "待回填"}</em>
      </div>

      <div className="id-grid sequencing-library-grid">
        {registration.entries.map((entry) => (
          <span key={entry.id}>
            {entry.sourceSampleId} · 投入量 {entry.inputAmountNg} ng
          </span>
        ))}
      </div>
      {registration.storagePath ? <p className="muted-text">储存路径：{registration.storagePath}</p> : null}

      <div className="form-grid result-grid">
        {labFormConfig.sequencingResultFields.map((field) => (
          <ConfiguredField
            field={field}
            key={field.key}
            value={String(form[field.key as keyof SequencingResultFormState] ?? "")}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                [field.key]: value
              }))
            }
          />
        ))}
        <label className="span-2">
          备注
          <textarea
            rows={2}
            value={form.remark}
            onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
          />
        </label>
      </div>

      <div className="button-row">
        <button className="danger-button" disabled={saving} type="button" onClick={deleteForm}>
          <Trash2 size={16} />
          删除表单
        </button>
        <button disabled={saving} type="button" onClick={() => save("draft")}>
          <Save size={16} />
          暂存
        </button>
        <button className="primary-button" disabled={saving} type="submit">
          <Send size={16} />
          {saving ? "处理中" : "提交结果"}
        </button>
      </div>
    </form>
  );
}

function ManualEditPage({
  labFormConfig,
  onMessage,
  onRefresh
}: {
  labFormConfig: LabFormConfig;
  onMessage: (message: Message) => void;
  onRefresh: () => Promise<void>;
}) {
  const [queryId, setQueryId] = useState("");
  const [payload, setPayload] = useState<ManualEditPayload | null>(null);
  const [sampleForm, setSampleForm] = useState({
    name: "",
    type: "CDNA" as SampleType,
    volume: "",
    concentration: "",
    storageLocation: "",
    tissueSource: "",
    originalFragmentDistribution: "",
    remark: ""
  });
  const [resultForms, setResultForms] = useState<Record<string, ResultFormState>>({});
  const [saving, setSaving] = useState(false);

  async function loadForEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onMessage(null);

    try {
      const nextPayload = await requestJson<ManualEditPayload>(
        `/api/manual-edit/${encodeURIComponent(queryId.trim().toUpperCase())}`
      );
      setPayload(nextPayload);
      const rootSample = nextPayload.rootSample;
      if (rootSample) {
        setSampleForm({
          name: rootSample.name,
          type: rootSample.type,
          volume: rootSample.detail?.volume?.toString() ?? "",
          concentration: rootSample.detail?.concentration?.toString() ?? "",
          storageLocation: rootSample.detail?.storageLocation ?? "",
          tissueSource: rootSample.detail?.tissueSource ?? "",
          originalFragmentDistribution: integerStringOrBlank(rootSample.detail?.originalFragmentDistribution),
          remark: rootSample.remark ?? ""
        });
      }
      setResultForms(
        Object.fromEntries(
          nextPayload.upstreamSteps.map((step) => [
            step.id,
            {
              volume: step.result?.volume?.toString() ?? "",
              concentration: step.result?.concentration?.toString() ?? "",
              storageLocation: step.result?.storageLocation ?? "",
              fragmentDistribution: integerStringOrBlank(step.result?.fragmentDistribution),
              experimentMethod: step.result?.experimentMethod ?? "",
              generationStrategy: step.result?.generationStrategy ?? "",
              inputAmount: step.result?.inputAmount?.toString() ?? "",
              outputVolume: step.result?.outputVolume?.toString() ?? "",
              libraryDuration: step.result?.libraryDuration ?? "",
              libraryStrategy: step.result?.libraryStrategy ?? "",
              absorbance260280: step.result?.absorbance260280?.toString() ?? "",
              absorbance260230: step.result?.absorbance260230?.toString() ?? "",
              barcode: step.result?.barcode ?? "",
              sliceCount: step.result?.sliceCount?.toString() ?? "",
              sliceDetails: step.result?.sliceDetails ?? "",
              chipId: step.result?.chipId ?? "",
              imageStorageLocation: step.result?.imageStorageLocation ?? "",
              qc: step.result?.qc ?? "",
              fragmentLength: integerStringOrBlank(step.result?.fragmentLength),
              remark: step.result?.remark ?? ""
            }
          ])
        )
      );
    } catch (error) {
      setPayload(null);
      onMessage({ type: "error", text: error instanceof Error ? error.message : "读取可修改数据失败。" });
    }
  }

  async function saveManualEdit() {
    if (!payload) {
      return;
    }

    setSaving(true);
    onMessage(null);
    try {
      const updated = await requestJson<ManualEditPayload>(
        `/api/manual-edit/${encodeURIComponent(payload.query)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sample: payload.rootSample
              ? {
                  name: sampleForm.name,
                  type: sampleForm.type,
                  remark: sampleForm.remark,
                  detail: {
                    volume: sampleForm.volume,
                    concentration: sampleForm.concentration,
                    storageLocation: sampleForm.storageLocation,
                    tissueSource: sampleForm.tissueSource,
                    originalFragmentDistribution: sampleForm.originalFragmentDistribution
                  }
                }
              : undefined,
            results: Object.entries(resultForms).map(([derivedSampleId, form]) => ({
              derivedSampleId,
              ...form
            }))
          })
        }
      );
      setPayload(updated);
      await onRefresh();
      onMessage({ type: "success", text: `${payload.query} 的上游数据已更新。` });
    } catch (error) {
      onMessage({ type: "error", text: error instanceof Error ? error.message : "保存修改失败。" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="workspace query-page">
      <div className="section-title">
        <Edit3 size={20} />
        <div>
          <h2>手动修改实验数据</h2>
          <p>输入样本 ID 后，只显示当前样本及其上游链路；下游需要进入对应下游样本单独修改</p>
        </div>
      </div>

      <form className="query-form" onSubmit={loadForEdit}>
        <input
          required
          placeholder="例如 ABC-0001、ABC-0001-T01 或短码"
          value={queryId}
          onChange={(event) => setQueryId(event.target.value.toUpperCase())}
        />
        <button className="primary-button" type="submit">
          <FileSearch size={16} />
          查询可修改数据
        </button>
      </form>

      {payload ? (
        <div className="manual-edit-stack">
          {payload.rootSample ? (
            <article className="query-card">
              <h3>原始入库样本</h3>
              <div className="form-grid">
                <label>
                  样本 ID
                  <input disabled value={payload.rootSample.id} />
                </label>
                <label>
                  样本名称
                  <input
                    value={sampleForm.name}
                    onChange={(event) => setSampleForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <label>
                  样本类型
                  <select
                    value={sampleForm.type}
                    onChange={(event) =>
                      setSampleForm((current) => ({ ...current, type: event.target.value as SampleType }))
                    }
                  >
                    {Object.entries(SAMPLE_TYPES).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <NumberField
                  label={VOLUME_LABEL}
                  value={sampleForm.volume}
                  onChange={(value) => setSampleForm((current) => ({ ...current, volume: value }))}
                />
                <NumberField
                  label={CONCENTRATION_LABEL}
                  value={sampleForm.concentration}
                  onChange={(value) => setSampleForm((current) => ({ ...current, concentration: value }))}
                />
                <ComboboxField
                  label="储存位置"
                  options={labFormConfig.storageLocations}
                  value={sampleForm.storageLocation}
                  onChange={(value) => setSampleForm((current) => ({ ...current, storageLocation: value }))}
                />
                <TextField
                  label="所属组织"
                  value={sampleForm.tissueSource}
                  onChange={(value) => setSampleForm((current) => ({ ...current, tissueSource: value }))}
                />
                <NumberField
                  label={ORIGINAL_FRAGMENT_MEAN_LABEL}
                  min={1}
                  step={1}
                  value={sampleForm.originalFragmentDistribution}
                  onChange={(value) =>
                    setSampleForm((current) => ({ ...current, originalFragmentDistribution: value }))
                  }
                />
                <label>
                  备注
                  <input
                    value={sampleForm.remark}
                    onChange={(event) =>
                      setSampleForm((current) => ({ ...current, remark: event.target.value }))
                    }
                  />
                </label>
              </div>
            </article>
          ) : null}

          {payload.upstreamSteps.map((step) => (
            <ManualResultEditor
              form={resultForms[step.id]}
              key={step.id}
              onChange={(nextForm) =>
                setResultForms((current) => ({
                  ...current,
                  [step.id]: nextForm
                }))
              }
              labFormConfig={labFormConfig}
              step={step}
            />
          ))}

          {payload.upstreamSteps.length === 0 ? (
            <div className="empty-panel">该 ID 是原始入库样本，没有上游实验结果。</div>
          ) : null}

          <div className="button-row">
            <button className="primary-button" disabled={saving} type="button" onClick={saveManualEdit}>
              <Save size={16} />
              {saving ? "保存中" : "保存修改"}
            </button>
          </div>
        </div>
      ) : (
        <div className="empty-panel">请输入样本 ID 后查询可修改数据。</div>
      )}
    </section>
  );
}

function ManualResultEditor({
  step,
  form,
  onChange,
  labFormConfig
}: {
  step: ManualEditStep;
  form: ResultFormState | undefined;
  onChange: (form: ResultFormState) => void;
  labFormConfig: LabFormConfig;
}) {
  const current = form ?? {
    volume: "",
    concentration: "",
    storageLocation: "",
    fragmentDistribution: "",
    experimentMethod: "",
    generationStrategy: "",
    inputAmount: "",
    outputVolume: "",
    libraryDuration: "",
    libraryStrategy: "",
    absorbance260280: "",
    absorbance260230: "",
    barcode: "",
    sliceCount: "",
    sliceDetails: "",
    chipId: "",
    imageStorageLocation: "",
    qc: "",
    fragmentLength: "",
    remark: ""
  };

  function patch(key: keyof ResultFormState, value: string) {
    onChange({ ...current, [key]: value });
  }

  return (
    <article className="query-card">
      <h3>
        {step.label} · <span className="mono">{step.id}</span>
        {step.hashCode ? <small className="hash-inline">短码 {step.hashCode}</small> : null}
      </h3>
      <div className="form-grid">
        {step.experimentType === "TISSUE_SECTION" ? (
          <TissueSectionFields
            form={current}
            setForm={(updater) => {
              const next = typeof updater === "function" ? updater(current) : updater;
              onChange(next);
            }}
          />
        ) : (
          labFormConfig.experimentResultFields[step.experimentType].map((field) => (
            <ConfiguredField
              field={field}
              key={field.key}
              options={labFormConfig.storageLocations}
              value={String(current[field.key as keyof ResultFormState] ?? "")}
              onChange={(value) => patch(field.key as keyof ResultFormState, value)}
            />
          ))
        )}
        <label className="span-2">
          备注
          <textarea rows={2} value={current.remark} onChange={(event) => patch("remark", event.target.value)} />
        </label>
      </div>
    </article>
  );
}

function ResultForm({
  entry,
  labFormConfig,
  onDeleted,
  onSaved
}: {
  entry: RegistrationEntry;
  labFormConfig: LabFormConfig;
  onDeleted: () => Promise<void>;
  onSaved: (mode: "draft" | "submit") => Promise<void>;
}) {
  const result = entry.derivedSample.result;
  const type = entry.derivedSample.experimentType;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ResultFormState>({
    volume: result?.volume?.toString() ?? "",
    concentration: result?.concentration?.toString() ?? "",
    storageLocation: result?.storageLocation ?? "",
    fragmentDistribution: integerStringOrBlank(result?.fragmentDistribution),
    experimentMethod: result?.experimentMethod ?? "",
    generationStrategy: result?.generationStrategy ?? "",
    inputAmount: result?.inputAmount?.toString() ?? "",
    outputVolume: result?.outputVolume?.toString() ?? "",
    libraryDuration: result?.libraryDuration ?? "",
    libraryStrategy: result?.libraryStrategy ?? "",
    absorbance260280: result?.absorbance260280?.toString() ?? "",
    absorbance260230: result?.absorbance260230?.toString() ?? "",
    barcode: result?.barcode ?? "",
    sliceCount: result?.sliceCount?.toString() ?? "",
    sliceDetails: result?.sliceDetails ?? "",
    chipId: result?.chipId ?? "",
    imageStorageLocation: result?.imageStorageLocation ?? "",
    qc: result?.qc ?? "",
    fragmentLength: integerStringOrBlank(result?.fragmentLength),
    remark: result?.remark ?? ""
  });

  async function saveResult(mode: "draft" | "submit") {
    setSaving(true);
    try {
      await requestJson(`/api/results/${encodeURIComponent(entry.derivedSampleId)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ...form, mode })
      });
      await onSaved(mode);
    } finally {
      setSaving(false);
    }
  }

  async function deleteForm() {
    if (!window.confirm(`确认删除 ${entry.derivedSampleId} 的待回填表单吗？对应派生编号也会一并删除。`)) {
      return;
    }

    setSaving(true);
    try {
      await requestJson(`/api/results/${encodeURIComponent(entry.derivedSampleId)}`, {
        method: "DELETE"
      });
      await onDeleted();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="result-form"
      onSubmit={(event) => {
        event.preventDefault();
        saveResult("submit");
      }}
    >
      <div className="result-form-head">
        <div>
          <span>{entry.sourceSampleId}</span>
          <strong>{entry.derivedSampleId}</strong>
          {entry.derivedSample.hashCode ? <small>短码 {entry.derivedSample.hashCode}</small> : null}
        </div>
        <em>{result ? "已暂存" : "待回填"}</em>
      </div>

      <div className="form-grid result-grid">
        {type === "TISSUE_SECTION" ? (
          <TissueSectionFields form={form} setForm={setForm} />
        ) : (
          labFormConfig.experimentResultFields[type].map((field) => (
            <ConfiguredField
              field={field}
              key={field.key}
              options={labFormConfig.storageLocations}
              value={String(form[field.key as keyof ResultFormState] ?? "")}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  [field.key]: value
                }))
              }
            />
          ))
        )}

        <label className="span-2">
          备注
          <textarea
            rows={2}
            value={form.remark}
            onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
          />
        </label>
      </div>

      <div className="button-row">
        <button className="danger-button" disabled={saving} type="button" onClick={deleteForm}>
          <Trash2 size={16} />
          删除表单
        </button>
        <button disabled={saving} type="button" onClick={() => saveResult("draft")}>
          <Save size={16} />
          暂存
        </button>
        <button className="primary-button" disabled={saving} type="submit">
          <Send size={16} />
          {saving ? "处理中" : "提交结果"}
        </button>
      </div>
    </form>
  );
}

function TissueSectionFields({
  form,
  setForm
}: {
  form: ResultFormState;
  setForm: Dispatch<SetStateAction<ResultFormState>>;
}) {
  const rows = parseSliceRows(form.sliceDetails, Number(form.sliceCount) || 1);

  function updateRows(nextRows: SliceRow[]) {
    const normalizedRows = nextRows.map(normalizeSliceRow);
    setForm((current) => ({
      ...current,
      sliceCount: String(normalizedRows.length),
      sliceDetails: JSON.stringify(normalizedRows)
    }));
  }

  function updateSliceCount(value: string) {
    const count = Number(value);
    if (!Number.isInteger(count) || count < 1) {
      setForm((current) => ({ ...current, sliceCount: value }));
      return;
    }

    const nextRows = Array.from({ length: count }, (_, index) => rows[index] ?? blankSliceRow());
    setForm((current) => ({
      ...current,
      sliceCount: value,
      sliceDetails: JSON.stringify(nextRows.map(normalizeSliceRow))
    }));
  }

  function patchRow(index: number, patch: Partial<SliceRow>) {
    updateRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  return (
    <>
      <NumberField label="切片张数" min={1} step={1} value={form.sliceCount || "1"} onChange={updateSliceCount} />
      <div className="span-2 slice-grid">
        {rows.map((row, index) => {
          const totalThickness = calculateTotalThickness(row);
          return (
            <fieldset className="slice-fieldset" key={index}>
              <legend>第 {index + 1} 张切片</legend>
              <NumberField
                label="切片刀数"
                min={1}
                step={1}
                value={row.knifeCount}
                onChange={(value) => patchRow(index, { knifeCount: value })}
              />
              <NumberField
                label="切片厚度 (µm)"
                min={0}
                value={row.thickness}
                onChange={(value) => patchRow(index, { thickness: value })}
              />
              <label>
                总厚度 (µm)
                <input readOnly value={totalThickness} />
              </label>
              <TextField
                label="容器编号"
                value={row.containerCode}
                onChange={(value) => patchRow(index, { containerCode: value })}
              />
              <TextField
                label="采样组织区域"
                value={row.tissueRegion}
                onChange={(value) => patchRow(index, { tissueRegion: value })}
              />
              <ComboboxField
                label="切片类型"
                options={["冰冻切片", "石蜡切片", "其他"]}
                value={row.sectionType}
                onChange={(value) => patchRow(index, { sectionType: value })}
              />
              <label className="span-2">
                切片备注
                <input value={row.remark} onChange={(event) => patchRow(index, { remark: event.target.value })} />
              </label>
            </fieldset>
          );
        })}
      </div>
    </>
  );
}

function RecentBatches({ batches }: { batches: SampleBatch[] }) {
  if (batches.length === 0) {
    return null;
  }

  return (
    <div className="recent-batches">
      <div className="section-title inline-title">
        <Download size={18} />
        <div>
          <h2>最近入库批次</h2>
          <p>每一笔入库登记都可以重新导出完整 Excel</p>
        </div>
      </div>
      <div className="batch-grid">
        {batches.map((batch) => (
          <article className="batch-card" key={batch.id}>
            <strong>批次 #{batch.id}</strong>
            <span>
              {batch.projectCode} · {batch.count} 个样本
              {batch.createdBy ? ` · 入库人 ${batch.createdBy}` : ""} · {formatDateTime(batch.createdAt)}
            </span>
            <a href={`/api/export/samples?batchId=${batch.id}`}>
              <Download size={15} />
              导出完整信息
            </a>
          </article>
        ))}
      </div>
    </div>
  );
}

function SampleSnapshot({ title, sample }: { title: string; sample: Sample }) {
  return (
    <article className="query-card">
      <h3>{title}</h3>
      <dl className="info-grid">
        <div>
          <dt>样本 ID</dt>
          <dd className="mono">{sample.id}</dd>
        </div>
        <div>
          <dt>短码</dt>
          <dd className="mono">{sample.hashCode ?? ""}</dd>
        </div>
        <div>
          <dt>样本名称</dt>
          <dd>{sample.name}</dd>
        </div>
        <div>
          <dt>入库人</dt>
          <dd>{sample.batch?.createdBy ?? ""}</dd>
        </div>
        <div>
          <dt>样本类型</dt>
          <dd>{SAMPLE_TYPES[sample.type]}</dd>
        </div>
        <div>
          <dt>收样时间</dt>
          <dd>{formatDate(sample.receivedAt)}</dd>
        </div>
        <div>
          <dt>{VOLUME_LABEL}</dt>
          <dd>{sample.detail?.volume ?? ""}</dd>
        </div>
        <div>
          <dt>{CONCENTRATION_LABEL}</dt>
          <dd>{sample.detail?.concentration ?? ""}</dd>
        </div>
        <div>
          <dt>储存位置</dt>
          <dd>{sample.detail?.storageLocation ?? ""}</dd>
        </div>
      </dl>
    </article>
  );
}

function QueryStepList({
  title,
  steps,
  onSelectSample
}: {
  title: string;
  steps: QueryStep[];
  onSelectSample?: (sampleId: string) => void;
}) {
  return (
    <article className="query-card">
      <h3>{title}</h3>
      {steps.length > 0 ? (
        <div className="step-list">
          {steps.map((step) => (
            <div className="step-row" key={`${title}-${step.id}-${step.registration?.id ?? "none"}`}>
              <div>
                <strong className="mono">{step.id}</strong>
                <span>
                  {step.hashCode ? `短码 ${step.hashCode} · ` : ""}
                  {step.experimentType} · {formatDateTime(step.createdAt)}
                </span>
                <small>
                  来源 {step.sourceSampleId}
                  {step.inputAmountNg !== null ? ` · 上样量 ${step.inputAmountNg} ng` : ""}
                  {step.result?.submittedAt ? ` · 已提交 ${formatDateTime(step.result.submittedAt)}` : " · 未提交"}
                </small>
              </div>
              <div className="step-actions">
                {onSelectSample ? (
                  <button type="button" onClick={() => onSelectSample(step.id)}>
                    查看链路
                  </button>
                ) : null}
                {step.registration ? (
                  <a href={`/api/export/registrations/${step.registration.id}`}>
                    <Download size={15} />
                    导出登记
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted-text">暂无记录</p>
      )}
    </article>
  );
}

function SequencingRegistrationList({
  title,
  registrations
}: {
  title: string;
  registrations: Registration[];
}) {
  return (
    <article className="query-card">
      <h3>{title}</h3>
      {registrations.length > 0 ? (
        <div className="step-list">
          {registrations.map((registration) => (
            <div className="step-row" key={`${title}-${registration.id}`}>
              <div>
                <strong className="mono">{registration.chipNumber ?? `登记 #${registration.id}`}</strong>
                <span>
                  测序上机 · {registration.sequencingStrategy ?? "未填写策略"} ·{" "}
                  {formatDateTime(registration.registeredAt)}
                </span>
                <small>
                  投入文库 {registration.entries.map((entry) => entry.sourceSampleId).join(", ")}
                  {registration.sequencingResult?.submittedAt
                    ? ` · 已下机 ${formatDateTime(registration.sequencingResult.submittedAt)}`
                    : " · 未下机"}
                </small>
              </div>
              <a href={`/api/export/registrations/${registration.id}`}>
                <Download size={15} />
                导出登记
              </a>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted-text">暂无记录</p>
      )}
    </article>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  step = 0.01
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  step?: number;
}) {
  return (
    <label>
      {label}
      <input
        min={min}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  list
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  list?: string;
}) {
  return (
    <label>
      {label}
      <input list={list} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ComboboxField({
  label,
  options,
  required,
  value,
  onChange
}: {
  label: string;
  options: string[];
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const normalized = value.trim().toLowerCase();
  const filteredOptions = options
    .filter((option) => (normalized ? option.toLowerCase().includes(normalized) : true))
    .slice(0, 80);

  return (
    <label className="combo-field">
      {label}
      <input
        required={required}
        value={value}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && filteredOptions.length > 0 ? (
        <div className="combo-options">
          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

function fieldLabel(field: FieldConfig) {
  return field.unit ? `${field.label} (${field.unit})` : field.label;
}

function ConfiguredField({
  field,
  options: externalOptions,
  value,
  onChange
}: {
  field: FieldConfig;
  options?: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const label = fieldLabel(field);
  const options = field.optionSource === "storageLocations" ? externalOptions : field.options;

  if (field.type === "select") {
    return (
      <label>
        {label}
        <select required={field.required} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">未填写</option>
          {(options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="span-2">
        {label}
        <textarea
          required={field.required}
          rows={2}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  if (field.type === "combobox") {
    return <ComboboxField label={label} options={options ?? []} required={field.required} value={value} onChange={onChange} />;
  }

  return (
    <label>
      {label}
      <input
        list={field.optionSource === "storageLocations" ? "storage-location-options" : undefined}
        min={field.type === "integer" ? 1 : undefined}
        required={field.required}
        step={field.type === "integer" ? 1 : field.type === "number" ? 0.01 : undefined}
        type={field.type === "number" || field.type === "integer" ? "number" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ResultNumberInput({
  label,
  name,
  form,
  setForm,
  min,
  step = 0.01
}: {
  label: string;
  name: keyof ResultFormState;
  form: ResultFormState;
  setForm: Dispatch<SetStateAction<ResultFormState>>;
  min?: number;
  step?: number;
}) {
  return (
    <label>
      {label}
      <input
        min={min}
        step={step}
        type="number"
        value={form[name]}
        onChange={(event) =>
          setForm((current) => ({
            ...current,
            [name]: event.target.value
          }))
        }
      />
    </label>
  );
}

function ResultTextInput({
  label,
  name,
  form,
  setForm,
  list
}: {
  label: string;
  name: keyof ResultFormState;
  form: ResultFormState;
  setForm: Dispatch<SetStateAction<ResultFormState>>;
  list?: string;
}) {
  return (
    <label>
      {label}
      <input
        list={list}
        value={form[name]}
        onChange={(event) =>
          setForm((current) => ({
            ...current,
            [name]: event.target.value
          }))
        }
      />
    </label>
  );
}

type ResultFormState = {
  volume: string;
  concentration: string;
  storageLocation: string;
  fragmentDistribution: string;
  experimentMethod: string;
  generationStrategy: string;
  inputAmount: string;
  outputVolume: string;
  libraryDuration: string;
  libraryStrategy: string;
  absorbance260280: string;
  absorbance260230: string;
  barcode: string;
  sliceCount: string;
  sliceDetails: string;
  chipId: string;
  imageStorageLocation: string;
  qc: string;
  fragmentLength: string;
  remark: string;
};

type SliceRow = {
  knifeCount: string;
  thickness: string;
  totalThickness: string;
  containerCode: string;
  tissueRegion: string;
  sectionType: string;
  remark: string;
};

function blankSliceRow(): SliceRow {
  return {
    knifeCount: "",
    thickness: "",
    totalThickness: "",
    containerCode: "",
    tissueRegion: "",
    sectionType: "",
    remark: ""
  };
}

function normalizeSliceRow(row: SliceRow): SliceRow {
  return {
    ...row,
    totalThickness: calculateTotalThickness(row)
  };
}

function calculateTotalThickness(row: Pick<SliceRow, "knifeCount" | "thickness">) {
  const knifeCount = Number(row.knifeCount);
  const thickness = Number(row.thickness);

  if (!Number.isFinite(knifeCount) || !Number.isFinite(thickness)) {
    return "";
  }

  return String(Number((knifeCount * thickness).toFixed(4)));
}

function parseSliceRows(value: string, count: number) {
  let rows: SliceRow[] = [];

  try {
    const parsed = JSON.parse(value || "[]") as Partial<SliceRow>[];
    rows = Array.isArray(parsed)
      ? parsed.map((row) => ({
          ...blankSliceRow(),
          ...row,
          knifeCount: String(row.knifeCount ?? ""),
          thickness: String(row.thickness ?? ""),
          totalThickness: String(row.totalThickness ?? ""),
          containerCode: String(row.containerCode ?? ""),
          tissueRegion: String(row.tissueRegion ?? ""),
          sectionType: String(row.sectionType ?? ""),
          remark: String(row.remark ?? "")
        }))
      : [];
  } catch {
    rows = [];
  }

  const safeCount = Number.isInteger(count) && count > 0 ? count : Math.max(rows.length, 1);
  return Array.from({ length: safeCount }, (_, index) => rows[index] ?? blankSliceRow());
}

type SequencingResultFormState = {
  dataAmount: string;
  uploadPath: string;
  sequencingStrategy: string;
  barcode: string;
  remark: string;
};
