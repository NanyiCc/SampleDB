"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  FileText,
  FlaskConical,
  GitCompareArrows,
  Layers3,
  Link2,
  ListFilter,
  Microscope,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  TestTube2,
  UserRound,
  X,
  AlertCircle,
  Save,
  RotateCcw,
  Server,
  FolderOpen,
  Dna,
  Droplets,
  Grid2X2,
  Pencil,
  ExternalLink,
  LogOut,
} from "lucide-react";
import {
  EXPERIMENT_CONFIG,
  SAMPLE_TYPES,
  type ExperimentType,
  type SampleType,
} from "@/lib/domain";
import {
  comparisonCsv,
  createDemoData,
  refreshSeedLabels,
  fromApi,
  lineageFor,
  metricValue,
  metricsFor,
  nextDerivedId,
  numericDelta,
  sameMetric,
  type ComparisonSnapshot,
  type Values,
  type WorkspaceData,
  type WorkspaceRun,
  type WorkspaceSample,
} from "@/lib/workspace-model";
import configFile from "@/lab-form-config.json";
import type { FieldConfig } from "@/lib/lab-form-config";
import "./workspace.css";

type Page = "samples" | "experiments" | "compare" | "projects" | "monitor";
type Modal =
  | "intake"
  | "sampling"
  | "result"
  | "plan"
  | "saved"
  | "reset"
  | null;
const pages: { id: Page; label: string }[] = [
  { id: "samples", label: "样本" },
  { id: "experiments", label: "实验" },
  { id: "compare", label: "对比与优化" },
  { id: "projects", label: "项目" },
  { id: "monitor", label: "运行监控" },
];
const statusText = { pending: "待回填", draft: "暂存", submitted: "已提交" };
const sampleIcons = {
  TISSUE: Layers3,
  CDNA: Dna,
  WHOLE_BLOOD: Droplets,
  PLASMA: TestTube2,
  CELL: Microscope,
};
const stageIcons = {
  ENRICHMENT: TestTube2,
  ARRAY: Grid2X2,
  LIGATION: Link2,
  LIBRARY: Layers3,
  SEQUENCING: Server,
  SINGLE_CELL: Microscope,
  TISSUE_SECTION: Layers3,
  SECTION_PLACEMENT: Grid2X2,
  CDNA_PREP: Dna,
};
const DEMO_KEY = "sampledb-workspace-demo-v1";
const blank: WorkspaceData = {
  version: 1,
  samples: [],
  runs: [],
  comparisons: [],
  plans: [],
};
const formatDay = (date: string) =>
  date
    ? new Date(date).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : "未记录";
const display = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? "未记录"
    : String(value);
const shortId = (id: string) =>
  id.length > 24 ? `${id.slice(0, 10)}…${id.slice(-6)}` : id;
function download(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function Badge({ status }: { status: WorkspaceRun["status"] }) {
  return (
    <span className={`ws-badge ${status}`}>
      {status === "submitted" ? (
        <CheckCircle2 size={13} />
      ) : (
        <Clock3 size={13} />
      )}
      {statusText[status]}
    </span>
  );
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="ws-empty">
      <Database size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function ModalFrame({
  title,
  subtitle,
  close,
  children,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const frame = ref.current;
    frame
      ?.querySelector<HTMLElement>("input, select, button, textarea")
      ?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key !== "Tab") return;
      const els = Array.from(
        frame?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
        ) ?? [],
      );
      if (e.shiftKey && document.activeElement === els[0]) {
        e.preventDefault();
        els.at(-1)?.focus();
      }
      if (!e.shiftKey && document.activeElement === els.at(-1)) {
        e.preventDefault();
        els[0]?.focus();
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []); // Capture the opening state, restore focus to its trigger on close.
  return (
    <div
      className="ws-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="ws-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ws-dialog-title"
        ref={ref}
      >
        <header>
          <div>
            <h2 id="ws-dialog-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="ws-icon" aria-label="关闭弹窗" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export default function Workspace({
  demo = false,
  published = false,
}: {
  demo?: boolean;
  published?: boolean;
}) {
  const workspaceHome = published
    ? `${process.env.NEXT_PUBLIC_PAGES_BASE_PATH || ""}/`
    : demo
      ? "/demo"
      : "/";
  const [data, setData] = useState<WorkspaceData>(blank);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState<Page>("samples");
  const [sampleId, setSampleId] = useState("LAB01-0012");
  const [runId, setRunId] = useState("");
  const [sampleTab, setSampleTab] = useState("关联链路");
  const [compareTab, setCompareTab] = useState("参数与结果");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [project, setProject] = useState("");
  const [stage, setStage] = useState<ExperimentType>("LIBRARY");
  const [experimentFilter, setExperimentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [baseline, setBaseline] = useState("");
  const [differences, setDifferences] = useState(false);
  const [frozen, setFrozen] = useState<ComparisonSnapshot | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState(false);
  const [username, setUsername] = useState("实验员");
  const [userRole, setUserRole] = useState("USER");
  const [userId, setUserId] = useState<number | null>(null);
  const [fieldsConfig, setFieldsConfig] = useState<
    Record<string, FieldConfig[]>
  >(configFile.experimentResultFields as Record<string, FieldConfig[]>);
  const [seqFields, setSeqFields] = useState<FieldConfig[]>(
    configFile.sequencingResultFields as FieldConfig[],
  );
  const searchRef = useRef<HTMLInputElement>(null);

  function initialize(value: WorkspaceData) {
    setData(value);
    setSampleId(value.samples[0]?.id ?? "");
    const initial = value.runs
      .filter((r) => r.type === "LIBRARY" && r.status === "submitted")
      .slice(0, 3)
      .map((r) => r.id);
    setSelected(initial);
    setBaseline(initial[0] ?? "");
    setReady(true);
  }
  async function loadLive() {
    setError("");
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok) throw new Error("读取工作区失败，请重试。");
      const payload = await response.json();
      const value = fromApi(payload);
      setUsername(payload.user.displayName || payload.user.username);
      setUserRole(payload.user.role);
      setUserId(payload.user.id);
      try {
        const local = JSON.parse(
          localStorage.getItem(`sampledb-workspace-saved-${payload.user.id}`) ??
            "null",
        );
        if (
          local &&
          Array.isArray(local.comparisons) &&
          Array.isArray(local.plans)
        ) {
          value.comparisons = local.comparisons;
          value.plans = local.plans;
        }
      } catch {
        setToast("本地对比记录无法读取，服务器样本不受影响。");
      }
      initialize(value);
      const configResponse = await fetch("/api/lab-form-config");
      if (configResponse.ok) {
        const config = await configResponse.json();
        setFieldsConfig(config.experimentResultFields);
        setSeqFields(config.sequencingResultFields);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }
  useEffect(() => {
    if (demo) {
      try {
        const saved = JSON.parse(localStorage.getItem(DEMO_KEY) ?? "null");
        if (
          saved?.version === 1 &&
          Array.isArray(saved.samples) &&
          Array.isArray(saved.runs) &&
          Array.isArray(saved.comparisons) &&
          Array.isArray(saved.plans) &&
          saved.samples.every(
            (s: WorkspaceSample) => s.id && s.type in SAMPLE_TYPES && s.detail,
          ) &&
          saved.runs.every(
            (r: WorkspaceRun) =>
              r.id && r.type in EXPERIMENT_CONFIG && r.values,
          )
        )
          initialize(refreshSeedLabels(saved));
        else initialize(createDemoData());
      } catch {
        initialize(createDemoData());
        setToast("本地缓存无法读取，已重新载入初始数据。");
      }
    } else void loadLive();
  }, [demo]);
  useEffect(() => {
    if (!ready) return;
    try {
      if (demo) localStorage.setItem(DEMO_KEY, JSON.stringify(data));
      else if (userId)
        localStorage.setItem(
          `sampledb-workspace-saved-${userId}`,
          JSON.stringify({ comparisons: data.comparisons, plans: data.plans }),
        );
    } catch {
      setToast("浏览器存储不可用，本次修改仅保留在当前页面。请及时导出。");
    }
  }, [data, ready, demo, userId]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const update = () => {
      const hash = window.location.hash.slice(1);
      if (pages.some((p) => p.id === hash)) setPage(hash as Page);
    };
    update();
    window.addEventListener("hashchange", update);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("hashchange", update);
      document.removeEventListener("keydown", key);
    };
  }, []);

  const samples = data.samples;
  const sample = samples.find((s) => s.id === sampleId);
  const sampleRuns = data.runs.filter((r) => r.sampleId === sampleId);
  const run =
    sampleRuns.find((r) => r.id === runId) ??
    sampleRuns.find((r) => r.type === "LIBRARY") ??
    sampleRuns.at(-1);
  const lineage = run ? lineageFor(run, data.runs) : [];
  const sampleResults = samples.filter(
    (s) =>
      (!typeFilter || s.type === typeFilter) &&
      (!project || s.project === project) &&
      [s.id, s.tube, s.hash, s.name, s.project].some((v) =>
        v.toLowerCase().includes(query.toLowerCase().trim()),
      ),
  );
  const candidates = data.runs.filter(
    (r) =>
      r.type === stage &&
      r.status === "submitted" &&
      (!project ||
        samples.find((s) => s.id === r.sampleId)?.project === project) &&
      `${r.id} ${r.title} ${r.sampleId}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  const compared =
    frozen?.runs ??
    selected
      .map((id) => data.runs.find((r) => r.id === id))
      .filter((r): r is WorkspaceRun => Boolean(r));
  const base = compared.find((r) => r.id === baseline) ?? compared[0];
  const metrics = metricsFor(compared[0]?.type ?? stage);
  const shownMetrics =
    differences && compared.length > 1
      ? metrics.filter((m) =>
          compared.some(
            (r) => !sameMetric(metricValue(r, m), metricValue(compared[0], m)),
          ),
        )
      : metrics;
  const projects = [...new Set(samples.map((s) => s.project))];
  const allExperimentRows = data.runs
    .filter(
      (r) =>
        (!experimentFilter || r.type === experimentFilter) &&
        (!statusFilter || r.status === statusFilter) &&
        (!project ||
          samples.find((s) => s.id === r.sampleId)?.project === project) &&
        `${r.id} ${r.title} ${r.operator}`
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const resultFields =
    run?.type === "SEQUENCING"
      ? seqFields
      : (fieldsConfig[run?.type ?? "LIBRARY"] ?? []);
  const selectedPending = sampleRuns.filter(
    (r) => r.status !== "submitted",
  ).length;

  function navigate(next: Page) {
    setPage(next);
    window.history.replaceState(null, "", `#${next}`);
    setQuery("");
    setMenu(false);
  }
  function selectSample(id: string) {
    setSampleId(id);
    setRunId("");
    setSampleTab("关联链路");
  }
  function showRun(item: WorkspaceRun) {
    setSampleId(item.sampleId);
    setRunId(item.id);
    setSampleTab("关联链路");
    navigate("samples");
  }
  function changeStage(next: ExperimentType) {
    setStage(next);
    setSelected([]);
    setBaseline("");
    setFrozen(null);
  }
  function toggleCompare(item: WorkspaceRun) {
    setFrozen(null);
    if (selected.includes(item.id)) {
      const next = selected.filter((id) => id !== item.id);
      setSelected(next);
      if (baseline === item.id) setBaseline(next[0] ?? "");
      return;
    }
    if (selected.length >= 6) {
      setToast("一次最多比较 6 条记录，请先移除一条。");
      return;
    }
    if (
      item.type === "SEQUENCING" &&
      selected.some(
        (id) =>
          data.runs.find((r) => r.id === id)?.registrationId ===
            item.registrationId && item.registrationId != null,
      )
    ) {
      setToast("该测序登记单已加入对比，避免重复计算登记单总量。");
      return;
    }
    setSelected([...selected, item.id]);
    if (!baseline) setBaseline(item.id);
  }
  function addToCompare(item: WorkspaceRun) {
    if (item.status !== "submitted") {
      setToast("请先提交结果，再加入联合对比。");
      return;
    }
    const next = selected.filter(
      (id) => data.runs.find((r) => r.id === id)?.type === item.type,
    );
    if (!next.includes(item.id) && next.length >= 6) {
      setToast("一次最多比较 6 条记录。");
      return;
    }
    if (
      item.type === "SEQUENCING" &&
      next.some(
        (id) =>
          data.runs.find((r) => r.id === id)?.registrationId ===
            item.registrationId && item.registrationId != null,
      ) &&
      !next.includes(item.id)
    ) {
      setToast("该测序登记单已加入对比，避免重复计算登记单总量。");
      return;
    }
    if (!next.includes(item.id)) next.push(item.id);
    setStage(item.type);
    setFrozen(null);
    setSelected(next);
    setBaseline(next.includes(baseline) ? baseline : next[0]);
    setProject("");
    setCompareTab("参数与结果");
    navigate("compare");
  }
  function openModal(next: Modal, initial: Record<string, string> = {}) {
    setForm(initial);
    setFormError("");
    setModal(next);
    setMenu(false);
  }
  function openResult() {
    if (!run) return;
    const initial = Object.fromEntries(
      Object.entries(run.values).map(([k, v]) => [
        k,
        v == null ? "" : String(v),
      ]),
    );
    openModal("result", initial);
  }
  function openSampling() {
    if (!demo) {
      window.location.assign("/?page=sampling");
      return;
    }
    openModal("sampling", {
      sourceId: run?.status === "submitted" ? run.id : sampleId,
      type: "LIBRARY",
      inputAmount: "100",
      inputUnit: "ng",
      title: "",
    });
  }
  function openIntake() {
    if (!demo) window.location.assign("/?page=inventory");
    else
      openModal("intake", {
        project: "LAB01",
        type: "CDNA",
        receivedAt: new Date().toLocaleDateString("sv-SE"),
        name: "",
        tube: "",
        location: "A区-02架",
      });
  }
  function saveComparison() {
    if (compared.length < 2 || !base) return;
    const snapshot: ComparisonSnapshot = {
      id: crypto.randomUUID(),
      name: `${EXPERIMENT_CONFIG[stage].shortLabel}对比 · ${data.comparisons.length + 1}`,
      date: new Date().toISOString(),
      baseline: base.id,
      runs: structuredClone(compared),
    };
    setData((d) => ({ ...d, comparisons: [...d.comparisons, snapshot] }));
    setToast("对比快照已保存到当前浏览器，记录值已固定。");
  }
  function restoreComparison(snapshot: ComparisonSnapshot) {
    setStage(snapshot.runs[0].type);
    setSelected(snapshot.runs.map((r) => r.id));
    setBaseline(snapshot.baseline);
    setFrozen(snapshot);
    setCompareTab("参数与结果");
    setModal(null);
    navigate("compare");
  }
  async function saveResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!run || busy) return;
    const mode =
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "draft"
        ? "draft"
        : "submit";
    setFormError("");
    const values: Values = { ...run.values };
    for (const field of resultFields) {
      const raw = form[field.key]?.trim() ?? "";
      if (mode === "submit" && field.required && !raw) {
        setFormError(`请填写${field.label}。`);
        return;
      }
      if (
        (field.type === "number" || field.type === "integer") &&
        raw &&
        (!Number.isFinite(Number(raw)) ||
          Number(raw) < 0 ||
          (field.type === "integer" && !Number.isInteger(Number(raw))))
      ) {
        setFormError(
          `${field.label}需要填写有效的非负${field.type === "integer" ? "整数" : "数字"}。`,
        );
        return;
      }
      values[field.key] =
        raw === ""
          ? null
          : field.type === "number" || field.type === "integer"
            ? Number(raw)
            : raw;
    }
    if (run.type === "TISSUE_SECTION") {
      const count = Number(form.sliceCount);
      let slices: Array<{ knifeCount: number; thickness: number }>;
      try {
        slices = JSON.parse(form.sliceDetails || "[]");
      } catch {
        setFormError("切片明细需要有效的 JSON 数组。");
        return;
      }
      if (
        !Array.isArray(slices) ||
        (mode === "submit" &&
          (!Number.isInteger(count) ||
            count < 1 ||
            slices.length !== count ||
            slices.some(
              (s) =>
                !Number.isInteger(Number(s.knifeCount)) ||
                Number(s.knifeCount) < 0 ||
                !Number.isFinite(Number(s.thickness)) ||
                Number(s.thickness) < 0,
            )))
      ) {
        setFormError("请填写切片张数和相应的切片刀数、厚度明细。");
        return;
      }
      values.sliceCount = count || null;
      values.sliceDetails = JSON.stringify(slices);
    }
    values.remark = form.remark || null;
    setBusy(true);
    try {
      if (!demo) {
        const url =
          run.type === "SEQUENCING"
            ? `/api/registrations/${run.registrationId}/sequencing-result`
            : `/api/results/${encodeURIComponent(run.id)}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...values, mode }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "保存失败");
        Object.assign(values, payload.result);
      }
      setData((d) => ({
        ...d,
        runs: d.runs.map((r) =>
          r.id === run.id ||
          (run.type === "SEQUENCING" &&
            run.registrationId != null &&
            r.registrationId === run.registrationId)
            ? {
                ...r,
                values,
                status: mode === "submit" ? "submitted" : "draft",
              }
            : r,
        ),
      }));
      setModal(null);
      setToast(
        mode === "submit"
          ? "实验结果已提交，现可加入联合对比。"
          : "已暂存，稍后可以继续填写。",
      );
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  function submitDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (modal === "intake") {
      const code = form.project.trim().toUpperCase(),
        tube = form.tube.trim().toUpperCase();
      if (!/^[A-Z0-9]{1,9}$/.test(code)) {
        setFormError("项目 ID 为 1–9 位字母或数字。");
        return;
      }
      if (!tube || !form.name.trim()) {
        setFormError("请填写样本名称和冻存管 ID。");
        return;
      }
      if (samples.some((s) => s.tube === tube)) {
        setFormError("这个冻存管 ID 已被使用。");
        return;
      }
      const seq =
        Math.max(
          0,
          ...samples
            .filter((s) => s.project === code)
            .map((s) => Number(s.id.split("-")[1])),
        ) + 1;
      const item: WorkspaceSample = {
        id: `${code}-${String(seq).padStart(4, "0")}`,
        name: form.name.trim(),
        project: code,
        type: form.type as SampleType,
        tube,
        hash: crypto.randomUUID().slice(0, 8).toUpperCase(),
        location: form.location.trim(),
        receivedAt: `${form.receivedAt}T09:00:00+08:00`,
        detail: { remark: "手动入库" },
      };
      setData((d) => ({ ...d, samples: [...d.samples, item] }));
      setSampleId(item.id);
      setRunId("");
      setQuery("");
      setProject("");
      setTypeFilter("");
      setSampleTab("基础信息");
      navigate("samples");
      setToast(`${item.id} 已入库。`);
    }
    if (modal === "sampling") {
      const sourceRun = data.runs.find((r) => r.id === form.sourceId),
        sourceSample = samples.find(
          (s) => s.id === (sourceRun?.sampleId ?? form.sourceId),
        );
      if (!sourceSample || (sourceRun && sourceRun.status !== "submitted")) {
        setFormError("请选择原始样本或已提交的派生样本。");
        return;
      }
      const type = form.type as ExperimentType;
      if (type === "SEQUENCING" && sourceRun?.type !== "LIBRARY") {
        setFormError("测序实验请选择已提交的建库文库。");
        return;
      }
      if (type === "SINGLE_CELL" && sourceRun) {
        setFormError("单细胞实验请选择带冻存管 ID 的原始样本。");
        return;
      }
      if (
        !form.inputAmount.trim() ||
        !Number.isFinite(Number(form.inputAmount)) ||
        Number(form.inputAmount) < 0
      ) {
        setFormError("请输入有效的投入量。");
        return;
      }
      const id = nextDerivedId(form.sourceId, type, data.runs);
      const item: WorkspaceRun = {
        id,
        sampleId: sourceSample.id,
        sourceId: form.sourceId,
        type,
        title:
          form.title.trim() ||
          `${EXPERIMENT_CONFIG[type].shortLabel} · ${sourceSample.id}`,
        status: "pending",
        date: new Date().toISOString(),
        operator: username,
        inputAmount: Number(form.inputAmount),
        inputUnit: form.inputUnit,
        values:
          type === "SEQUENCING"
            ? {
                chipNumber: form.chipNumber,
                sequencingStrategy: form.sequencingStrategy,
              }
            : {},
        source: "demo-manual",
      };
      setData((d) => ({ ...d, runs: [...d.runs, item] }));
      showRun(item);
      setToast("取样登记已创建，派生样本编号已生成。");
    }
    if (modal === "plan") {
      if (compared.length < 2 || !base) {
        setFormError("请至少选择两条已提交的实验记录。");
        return;
      }
      if (
        ["title", "goal", "bounds", "hypothesis"].some(
          (key) => !form[key]?.trim(),
        )
      ) {
        setFormError("请完整填写方案内容。");
        return;
      }
      setData((d) => ({
        ...d,
        plans: [
          ...d.plans,
          {
            id: crypto.randomUUID(),
            title: form.title.trim(),
            goal: form.goal.trim(),
            bounds: form.bounds.trim(),
            hypothesis: form.hypothesis.trim(),
            date: new Date().toISOString(),
            baseline: base.id,
            runs: structuredClone(compared),
            status: "draft",
          },
        ],
      }));
      setCompareTab("优化记录");
      setToast("验证方案草稿已保存，尚未创建或执行实验。");
    }
    setModal(null);
  }
  const input = (
    key: string,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label className="ws-field" key={key}>
      {label}
      <input
        type={type}
        value={form[key] ?? ""}
        required={required}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        {...(type === "number" ? { min: 0, step: "any" } : {})}
      />
    </label>
  );
  const openPlan = () =>
    openModal("plan", {
      title: `${EXPERIMENT_CONFIG[stage].shortLabel}参数验证`,
      goal: "",
      bounds: "",
      hypothesis: "",
    });

  return (
    <div className="ws-app">
      <header className="ws-topbar">
        <a className="ws-brand" href={workspaceHome}>
          SampleDB <span>/</span> <b>智能样本库</b>
        </a>
        <nav aria-label="主导航">
          {pages.map((p) => (
            <button
              key={p.id}
              className={page === p.id ? "active" : ""}
              onClick={() => navigate(p.id)}
            >
              {p.label}
              {p.id === "monitor" && <span className="ws-planned">规划</span>}
            </button>
          ))}
        </nav>
        <div className="ws-top-actions">
          <button
            className="ws-icon"
            aria-label="搜索样本或实验"
            title="搜索 ⌘K"
            onClick={() => searchRef.current?.focus()}
          >
            <Search size={20} />
          </button>
          <div className="ws-account">
            <button onClick={() => setMenu(!menu)} aria-expanded={menu}>
              <UserRound size={19} />
              <span>{username}</span>
              <ChevronDown size={13} />
            </button>
            {menu && (
              <div className="ws-menu">
                {demo ? (
                  <>
                    {published ? (
                      <>
                        <a
                          href="https://github.com/NanyiCc/SampleDB"
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink size={15} />
                          GitHub 源码
                        </a>
                        <a href="https://github.com/NanyiCc/SampleDB/archive/refs/heads/main.zip">
                          <ArrowDownToLine size={15} />
                          下载源码
                        </a>
                      </>
                    ) : (
                      <a href="/">
                        <ExternalLink size={15} />
                        正式数据工作区
                      </a>
                    )}
                    <button onClick={() => openModal("reset")}>
                      <RotateCcw size={15} />
                      恢复初始数据
                    </button>
                  </>
                ) : (
                  <>
                    <a href="/?page=inventory">
                      <Database size={15} />
                      完整登记表单
                    </a>
                    {userRole === "ADMIN" && (
                      <a href="/?page=users">
                        <Settings2 size={15} />
                        用户管理
                      </a>
                    )}
                    <a href="/demo">
                      <FlaskConical size={15} />
                      浏览器工作区
                    </a>
                    <button
                      onClick={async () => {
                        await fetch("/api/auth/logout", { method: "POST" });
                        window.location.assign("/login");
                      }}
                    >
                      <LogOut size={15} />
                      退出登录
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="ws-context">
        <div>
          测序实验室 <ChevronRight size={13} />{" "}
          <strong>
            {pages.find((p) => p.id === page)?.label}
            {page === "samples" ? "档案" : "工作区"}
          </strong>
        </div>
        <div>
          <span className="ws-mode">
            <span className="ws-dot" />
            {demo ? "浏览器工作区" : "正式数据"}
          </span>
          <span className="ws-context-separator" />
          <span>人工执行与录入</span>
          {demo && (
            <button
              onClick={() => openModal("reset")}
              title="恢复当前浏览器的初始数据"
            >
              <RotateCcw size={14} />
              恢复初始数据
            </button>
          )}
        </div>
      </div>
      {error ? (
        <div className="ws-load">
          <AlertCircle size={28} />
          <h2>{error}</h2>
          <button className="ws-button primary" onClick={() => void loadLive()}>
            重新加载
          </button>
          <a href="/demo">打开浏览器工作区</a>
        </div>
      ) : !ready ? (
        <div className="ws-load">
          <Database size={28} />
          <p>正在载入样本与实验记录…</p>
        </div>
      ) : (
        <div className="ws-body">
          <aside className="ws-sidebar">
            <div className="ws-sidebar-controls">
              <div className="ws-side-title">
                <span>{page === "compare" ? "候选实验" : "样本索引"}</span>
                <button
                  className="ws-icon"
                  aria-label="样本入库"
                  onClick={openIntake}
                >
                  <Plus size={17} />
                </button>
              </div>
              <label className="ws-search">
                <Search size={17} />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    page === "compare" || page === "experiments"
                      ? "实验 ID / 项目"
                      : "ID / 冻存管 / 短码"
                  }
                  aria-label="搜索"
                />
                {query && (
                  <button aria-label="清空搜索" onClick={() => setQuery("")}>
                    <X size={13} />
                  </button>
                )}
              </label>
              {page === "compare" ? (
                <label className="ws-select-row">
                  实验阶段
                  <select
                    value={stage}
                    onChange={(e) =>
                      changeStage(e.target.value as ExperimentType)
                    }
                    aria-label="对比实验阶段"
                  >
                    {Object.entries(EXPERIMENT_CONFIG).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value.shortLabel}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="ws-filter-pair">
                  <select
                    aria-label="样本类型筛选"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    <option value="">所有类型</option>
                    {Object.entries(SAMPLE_TYPES).map(([key, value]) => (
                      <option value={key} key={key}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="项目筛选"
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                  >
                    <option value="">全部项目</option>
                    {projects.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="ws-side-count">
              {page === "compare" ? (
                <>
                  <span>
                    已选 <b>{compared.length}</b> 条
                  </span>
                  <span>已提交 {candidates.length} 条</span>
                </>
              ) : (
                <>
                  <span>共 {sampleResults.length} 份样本</span>
                  <ListFilter size={14} />
                </>
              )}
            </div>
            <div className="ws-side-list">
              {page === "compare"
                ? candidates.map((item) => (
                    <button
                      key={item.id}
                      className={`ws-candidate ${selected.includes(item.id) && !frozen ? "selected" : ""}`}
                      onClick={() => toggleCompare(item)}
                      aria-pressed={selected.includes(item.id) && !frozen}
                      disabled={Boolean(frozen)}
                    >
                      <span
                        className={`ws-checkbox ${selected.includes(item.id) && !frozen ? "checked" : ""}`}
                      >
                        {selected.includes(item.id) && !frozen && (
                          <Check size={13} />
                        )}
                      </span>
                      <span className="ws-list-copy">
                        <strong title={item.id}>{shortId(item.id)}</strong>
                        <small>
                          {item.sampleId}
                          {baseline === item.id && <em>基准</em>}
                        </small>
                        <small className="ws-list-status">
                          <CheckCircle2 size={12} />
                          {formatDay(item.date)}
                        </small>
                      </span>
                    </button>
                  ))
                : sampleResults.map((item) => {
                    const Icon = sampleIcons[item.type];
                    return (
                      <button
                        key={item.id}
                        className={`ws-sample-item ${item.id === sampleId ? "selected" : ""}`}
                        onClick={() => {
                          selectSample(item.id);
                          if (page !== "samples") navigate("samples");
                        }}
                      >
                        <span
                          className={`ws-sample-icon ${item.type.toLowerCase()}`}
                        >
                          <Icon size={20} />
                        </span>
                        <span className="ws-list-copy">
                          <strong>
                            {item.id}
                            <em className={item.type.toLowerCase()}>
                              {SAMPLE_TYPES[item.type]}
                            </em>
                          </strong>
                          <small>
                            {item.tube || "无冻存管"}
                            <span>·</span>
                            {item.location || "位置未记录"}
                          </small>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    );
                  })}
              {(page === "compare"
                ? candidates.length
                : sampleResults.length) === 0 && (
                <p className="ws-no-matches">
                  没有匹配记录
                  <br />
                  <button
                    onClick={() => {
                      setQuery("");
                      setTypeFilter("");
                      setProject("");
                    }}
                  >
                    清除筛选
                  </button>
                </p>
              )}
            </div>
            <div className="ws-side-footer">
              {page === "compare" ? (
                <button onClick={() => navigate("samples")}>
                  <ArrowLeft size={15} />
                  返回样本全景
                </button>
              ) : (
                <button onClick={openIntake}>
                  <Plus size={16} />
                  样本入库
                </button>
              )}
              <small>
                {demo ? "修改保存在当前浏览器" : "实验记录连接本机数据库"}
              </small>
            </div>
          </aside>
          <main className={`ws-main ws-page-${page}`}>
            {page === "samples" &&
              (sample ? (
                <>
                  <div className="ws-page-heading">
                    <div>
                      <h1>样本全景档案</h1>
                      <p>连接每一份样本与它的实验历程。</p>
                    </div>
                    <span className="ws-small-note">
                      <ShieldCheck size={15} />
                      全程可追溯
                    </span>
                  </div>
                  <section className="ws-sample-summary">
                    <div className="ws-sample-identity">
                      <h2>{sample.id}</h2>
                      <span className="ws-type-tag">
                        {SAMPLE_TYPES[sample.type]}
                      </span>
                    </div>
                    <div className="ws-sample-facts">
                      <div>
                        <span>项目</span>
                        <strong>{sample.project}</strong>
                      </div>
                      <div>
                        <span>冻存管</span>
                        <strong>{sample.tube || "未记录"}</strong>
                      </div>
                      <div>
                        <span>储存位置</span>
                        <strong>{sample.location || "未记录"}</strong>
                      </div>
                    </div>
                    <div className="ws-actions">
                      <button
                        className="ws-button primary"
                        onClick={openSampling}
                      >
                        <FlaskConical size={17} />
                        发起取样
                      </button>
                      <button
                        className="ws-button"
                        onClick={() => {
                          download(
                            `${sample.id}.json`,
                            JSON.stringify(
                              { sample, experiments: sampleRuns },
                              null,
                              2,
                            ),
                            "application/json",
                          );
                          setToast("样本及实验档案已导出。");
                        }}
                      >
                        <ArrowDownToLine size={16} />
                        导出
                      </button>
                    </div>
                  </section>
                  <div
                    className="ws-tabs"
                    role="tablist"
                    aria-label="样本档案视图"
                  >
                    {["关联链路", "基础信息", "实验记录", "分析记录"].map(
                      (tab) => (
                        <button
                          role="tab"
                          aria-selected={sampleTab === tab}
                          className={sampleTab === tab ? "active" : ""}
                          key={tab}
                          onClick={() => setSampleTab(tab)}
                        >
                          {tab}
                          {tab === "实验记录" && (
                            <span className="ws-count">
                              {sampleRuns.length}
                            </span>
                          )}
                          {tab === "分析记录" && (
                            <span className="ws-planned">规划</span>
                          )}
                        </button>
                      ),
                    )}
                  </div>
                  {sampleTab === "关联链路" && (
                    <>
                      <section className="ws-panel ws-lineage-panel">
                        <div className="ws-section-head">
                          <h3>样本与实验链路</h3>
                          <div className="ws-legend">
                            <span>
                              <i className="green" />
                              已提交
                            </span>
                            <span>
                              <i className="amber" />
                              待回填
                            </span>
                            {sampleRuns.length > 0 && (
                              <select
                                aria-label="追溯到实验"
                                value={run?.id ?? ""}
                                onChange={(e) => setRunId(e.target.value)}
                              >
                                {sampleRuns.map((r) => (
                                  <option value={r.id} key={r.id}>
                                    {EXPERIMENT_CONFIG[r.type].shortLabel} ·{" "}
                                    {r.id}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                        <div className="ws-lineage">
                          <div className="ws-node root">
                            <span className="ws-node-icon">
                              <TestTube2 size={25} />
                            </span>
                            <h4>原始样本</h4>
                            <p title={sample.id}>{sample.id}</p>
                            <span className="ws-type-tag">
                              {SAMPLE_TYPES[sample.type]}
                            </span>
                            <div className="ws-node-bottom">
                              <span className="ws-node-status complete">
                                <CheckCircle2 size={15} />
                                已入库
                              </span>
                              <time>{formatDay(sample.receivedAt)}</time>
                            </div>
                          </div>
                          {lineage.map((item) => {
                            const Icon = stageIcons[item.type];
                            return (
                              <div className="ws-node-wrap" key={item.id}>
                                <ArrowRight
                                  className="ws-node-arrow"
                                  size={18}
                                />
                                <button
                                  className={`ws-node ${item.id === run?.id ? "current" : ""} ${item.status}`}
                                  onClick={() => setRunId(item.id)}
                                  aria-pressed={item.id === run?.id}
                                >
                                  <span className="ws-node-icon">
                                    <Icon size={25} />
                                  </span>
                                  <h4>
                                    {EXPERIMENT_CONFIG[item.type].shortLabel}
                                  </h4>
                                  <p title={item.id}>{shortId(item.id)}</p>
                                  <small>
                                    {item.id.split("-").slice(-2).join("-")}
                                  </small>
                                  <div className="ws-node-bottom">
                                    <span
                                      className={`ws-node-status ${item.status === "submitted" ? "complete" : "incomplete"}`}
                                    >
                                      {item.status === "submitted" ? (
                                        <CheckCircle2 size={15} />
                                      ) : (
                                        <Clock3 size={15} />
                                      )}
                                      {statusText[item.status]}
                                    </span>
                                    <time>{formatDay(item.date)}</time>
                                  </div>
                                </button>
                              </div>
                            );
                          })}
                          {run &&
                            data.runs
                              .filter((r) => r.sourceId === run.id)
                              .map((next) => (
                                <div key={next.id} className="ws-node-wrap">
                                  <ArrowRight
                                    size={18}
                                    className="ws-node-arrow"
                                  />
                                  <button
                                    className="ws-node next"
                                    onClick={() => setRunId(next.id)}
                                  >
                                    <span className="ws-node-icon">
                                      <Server size={25} />
                                    </span>
                                    <h4>
                                      {EXPERIMENT_CONFIG[next.type].shortLabel}
                                    </h4>
                                    <p title={next.id}>{shortId(next.id)}</p>
                                    <small>后续实验</small>
                                    <div className="ws-node-bottom">
                                      <Badge status={next.status} />
                                      <time>{formatDay(next.date)}</time>
                                    </div>
                                  </button>
                                </div>
                              ))}
                          {run?.type === "LIBRARY" &&
                            !data.runs.some((r) => r.sourceId === run.id) && (
                              <div className="ws-node-wrap">
                                <ArrowRight
                                  size={18}
                                  className="ws-node-arrow"
                                />
                                <button
                                  className="ws-node next"
                                  disabled={run.status !== "submitted"}
                                  onClick={() =>
                                    demo
                                      ? openModal("sampling", {
                                          sourceId: run.id,
                                          type: "SEQUENCING",
                                          inputAmount: "100",
                                          inputUnit: "ng",
                                          title: "",
                                        })
                                      : openSampling()
                                  }
                                >
                                  <span className="ws-node-icon">
                                    <Server size={25} />
                                  </span>
                                  <h4>测序</h4>
                                  <p>下一步实验</p>
                                  <small>
                                    {run.status === "submitted"
                                      ? "点击登记取样"
                                      : "待建库结果提交"}
                                  </small>
                                  <div className="ws-node-bottom">
                                    <span className="ws-node-status">
                                      <Clock3 size={15} />
                                      未登记
                                    </span>
                                  </div>
                                </button>
                              </div>
                            )}
                          {!sampleRuns.length && (
                            <div className="ws-lineage-start">
                              <p>尚未开始实验</p>
                              <button
                                className="ws-button"
                                onClick={openSampling}
                              >
                                <Plus size={15} />
                                登记第一次取样
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="ws-panel-foot">
                          <span>
                            {sampleRuns.length} 条关联实验
                            {selectedPending
                              ? ` · ${selectedPending} 条待完成`
                              : ""}
                          </span>
                          <button onClick={() => setSampleTab("实验记录")}>
                            查看全部记录
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </section>
                      {run && (
                        <section className="ws-panel ws-run-detail">
                          <div className="ws-detail-main">
                            <div className="ws-section-head">
                              <h3>
                                {EXPERIMENT_CONFIG[run.type].shortLabel}记录
                              </h3>
                              <span className="ws-record-meta">
                                登记日期 {formatDay(run.date)}{" "}
                                <Badge status={run.status} />
                              </span>
                            </div>
                            <div className="ws-record-id">
                              <strong title={run.id}>{run.id}</strong>
                              <button
                                className={`ws-button ${run.status !== "submitted" ? "primary" : ""}`}
                                onClick={
                                  run.status === "submitted"
                                    ? () => addToCompare(run)
                                    : openResult
                                }
                              >
                                {run.status === "submitted" ? (
                                  <GitCompareArrows size={15} />
                                ) : (
                                  <Pencil size={15} />
                                )}
                                {run.status === "submitted"
                                  ? "加入对比"
                                  : "继续回填"}
                              </button>
                            </div>
                            <div className="ws-detail-grid">
                              {metricsFor(run.type)
                                .slice(0, 6)
                                .map((metric) => (
                                  <div key={metric.key}>
                                    <label>
                                      {metric.label}
                                      {metric.unit && (
                                        <span>（{metric.unit}）</span>
                                      )}
                                    </label>
                                    <div
                                      className={
                                        metricValue(run, metric) === null
                                          ? "missing"
                                          : ""
                                      }
                                    >
                                      {display(metricValue(run, metric))}
                                    </div>
                                  </div>
                                ))}
                            </div>
                            {run.type === "SEQUENCING" && (
                              <p className="ws-helper">
                                数据量属于本次测序登记单，不代表单一样本的产出。
                              </p>
                            )}
                            <p className="ws-provenance">
                              <UserRound size={13} />
                              {run.operator} <span>·</span>
                              {run.source === "demo-manual"
                                ? "人工录入"
                                : "现有登记记录"}
                              <span>·</span>
                              <button onClick={openResult}>
                                {run.status === "submitted"
                                  ? "查看完整记录"
                                  : "编辑全部字段"}
                                <ChevronRight size={13} />
                              </button>
                            </p>
                          </div>
                          <aside className="ws-next">
                            <h3>
                              下一步关联{" "}
                              <span className="ws-planned">规划</span>
                            </h3>
                            <div>
                              <ShieldCheck size={18} />
                              <span>质控记录</span>
                              <small>尚未建立</small>
                            </div>
                            <div>
                              <FileText size={18} />
                              <span>分析记录</span>
                              <small>尚未关联</small>
                            </div>
                            <button
                              className="ws-text-button"
                              onClick={() => addToCompare(run)}
                              disabled={run.status !== "submitted"}
                            >
                              <GitCompareArrows size={16} />
                              对比同阶段实验
                              <ArrowRight size={14} />
                            </button>
                            <p>
                              关联实验参数与结果，逐步积累可验证的优化依据。
                            </p>
                          </aside>
                        </section>
                      )}
                      <p className="ws-chain-caption">
                        原始样本 <ArrowRight size={12} /> 派生样本{" "}
                        <ArrowRight size={12} /> 实验参数{" "}
                        <ArrowRight size={12} /> 质控与分析
                      </p>
                    </>
                  )}
                  {sampleTab === "基础信息" && (
                    <section className="ws-panel ws-info-panel">
                      <div className="ws-section-head">
                        <h3>样本信息</h3>
                        <span className="ws-small-note">{sample.name}</span>
                      </div>
                      <dl className="ws-info-grid">
                        {Object.entries({
                          "样本 ID": sample.id,
                          "冻存管 ID": sample.tube,
                          查询短码: sample.hash,
                          样本类型: SAMPLE_TYPES[sample.type],
                          所属项目: sample.project,
                          收样日期: formatDay(sample.receivedAt),
                          储存位置: sample.location,
                          来源组织: sample.detail.tissueSource,
                          "体积（µL）": sample.detail.volume,
                          "浓度（ng/µL）": sample.detail.concentration,
                          备注: sample.detail.remark,
                        }).map(([key, value]) => (
                          <div key={key}>
                            <dt>{key}</dt>
                            <dd>{display(value)}</dd>
                          </div>
                        ))}
                      </dl>
                      {!demo && (
                        <a className="ws-button" href={`/?page=edit`}>
                          完整信息修改
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </section>
                  )}
                  {sampleTab === "实验记录" && renderRunTable(sampleRuns)}
                  {sampleTab === "分析记录" && (
                    <section className="ws-panel">
                      <Empty title="为分析结果保留完整来源">
                        后续将关联分析方法、软件版本、输入数据及输出文件。当前可从实验记录查看已填写的数据路径。
                      </Empty>
                      <div className="ws-empty-action">
                        <button
                          className="ws-button"
                          onClick={() => setSampleTab("实验记录")}
                        >
                          查看实验记录
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    </section>
                  )}
                </>
              ) : (
                <Empty title="还没有样本">
                  {demo
                    ? "请调整筛选或新增样本。"
                    : "在现有登记表中录入样本，或打开浏览器工作区。"}
                  <br />
                  <button className="ws-button primary" onClick={openIntake}>
                    样本入库
                  </button>
                </Empty>
              ))}
            {page === "experiments" && (
              <>
                <div className="ws-page-heading">
                  <div>
                    <h1>实验记录</h1>
                    <p>从取样登记到结果回填，每一次操作都有迹可循。</p>
                  </div>
                  <button className="ws-button primary" onClick={openSampling}>
                    <Plus size={17} />
                    新建取样登记
                  </button>
                </div>
                <div className="ws-experiment-summary">
                  <div>
                    <strong>{data.runs.length}</strong>
                    <span>全部实验</span>
                  </div>
                  <div>
                    <strong>
                      {data.runs.filter((r) => r.status === "pending").length}
                    </strong>
                    <span>待回填</span>
                  </div>
                  <div>
                    <strong>
                      {data.runs.filter((r) => r.status === "draft").length}
                    </strong>
                    <span>暂存中</span>
                  </div>
                  <div>
                    <strong>
                      {data.runs.filter((r) => r.status === "submitted").length}
                    </strong>
                    <span>已提交</span>
                  </div>
                </div>
                <div className="ws-toolbar">
                  <div>
                    <select
                      aria-label="实验类型筛选"
                      value={experimentFilter}
                      onChange={(e) => setExperimentFilter(e.target.value)}
                    >
                      <option value="">全部实验类型</option>
                      {Object.entries(EXPERIMENT_CONFIG).map(([key, value]) => (
                        <option key={key} value={key}>
                          {value.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="实验状态筛选"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="">全部状态</option>
                      {Object.entries(statusText).map(([key, value]) => (
                        <option key={key} value={key}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span>{allExperimentRows.length} 条记录</span>
                </div>
                {renderRunTable(allExperimentRows)}
              </>
            )}
            {page === "compare" && (
              <>
                <div className="ws-page-heading">
                  <div>
                    <h1>实验联合对比</h1>
                    <p>对照参数与结果，为下一轮实验保留依据。</p>
                  </div>
                  <div className="ws-actions">
                    <button
                      className="ws-button primary"
                      onClick={saveComparison}
                      disabled={compared.length < 2}
                    >
                      <Save size={16} />
                      保存对比
                    </button>
                    <button
                      className="ws-button"
                      disabled={!compared.length}
                      onClick={() =>
                        download(
                          `实验对比-${stage}.csv`,
                          comparisonCsv(compared, base?.id ?? ""),
                        )
                      }
                    >
                      <ArrowDownToLine size={16} />
                      导出
                    </button>
                  </div>
                </div>
                <div
                  className="ws-tabs"
                  role="tablist"
                  aria-label="实验对比视图"
                >
                  {["参数与结果", "关联链路", "优化记录"].map((tab) => (
                    <button
                      key={tab}
                      role="tab"
                      aria-selected={compareTab === tab}
                      className={compareTab === tab ? "active" : ""}
                      onClick={() => setCompareTab(tab)}
                    >
                      {tab}
                      {tab === "优化记录" && (
                        <span className="ws-count">{data.plans.length}</span>
                      )}
                    </button>
                  ))}
                  <button
                    className="ws-tab-right"
                    onClick={() => openModal("saved")}
                  >
                    <BookOpen size={15} />
                    已保存 {data.comparisons.length}
                  </button>
                </div>
                {frozen && (
                  <div className="ws-snapshot-banner">
                    <BookOpen size={16} />
                    <span>
                      正在查看保存于 {formatDay(frozen.date)}{" "}
                      的快照，显示当时的记录值。
                    </span>
                    <button
                      onClick={() => {
                        setFrozen(null);
                        setSelected([]);
                        setBaseline("");
                      }}
                    >
                      返回当前记录
                    </button>
                  </div>
                )}
                {compareTab === "参数与结果" && (
                  <div className="ws-comparison-layout">
                    <div className="ws-comparison-main">
                      <div className="ws-compare-notice">
                        <AlertCircle size={17} />
                        <span>可比性待核对：协议版本、试剂批次尚未记录。</span>
                        <button onClick={() => setCompareTab("关联链路")}>
                          查看条件
                          <ChevronRight size={13} />
                        </button>
                      </div>
                      <div className="ws-compare-toolbar">
                        <label className="ws-switch-label">
                          <input
                            type="checkbox"
                            checked={differences}
                            onChange={(e) => setDifferences(e.target.checked)}
                          />
                          <span className="ws-switch" />
                          仅看差异
                        </label>
                        <label className="ws-baseline-label">
                          基准实验
                          <select
                            value={base?.id ?? ""}
                            disabled={!compared.length}
                            onChange={(e) => setBaseline(e.target.value)}
                            aria-label="基准实验"
                          >
                            {!compared.length && (
                              <option value="">请先选择记录</option>
                            )}
                            {compared.map((r) => (
                              <option key={r.id} value={r.id}>
                                {shortId(r.id)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {compared.length ? (
                        <div className="ws-matrix-scroll">
                          <table className="ws-matrix">
                            <thead>
                              <tr>
                                <th>指标 / 单位</th>
                                {compared.map((r) => (
                                  <th
                                    key={r.id}
                                    className={
                                      r.id === base?.id ? "baseline" : ""
                                    }
                                  >
                                    <strong title={r.id}>
                                      {shortId(r.id)}
                                    </strong>
                                    {r.id === base?.id && (
                                      <span className="ws-baseline-badge">
                                        基准
                                      </span>
                                    )}
                                    <small>{r.sampleId}</small>
                                    <small>
                                      <UserRound size={12} />
                                      {r.source === "demo-manual"
                                        ? "人工录入"
                                        : "登记记录"}
                                    </small>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {["输入参数", "实验结果"].map((group) => (
                                <FragmentRows
                                  key={group}
                                  title={group}
                                  metrics={shownMetrics.filter(
                                    (m) => m.group === group,
                                  )}
                                  runs={compared}
                                  baseline={base}
                                />
                              ))}
                            </tbody>
                          </table>
                          {shownMetrics.length === 0 && (
                            <p className="ws-matrix-empty">
                              所选指标没有差异。关闭“仅看差异”可查看完整记录。
                            </p>
                          )}
                        </div>
                      ) : (
                        <section className="ws-panel">
                          <Empty title="选择实验，开始对比">
                            从左侧勾选 2–6 条同阶段、已提交的实验记录。
                          </Empty>
                        </section>
                      )}
                      {compared.length === 1 && (
                        <p className="ws-helper">
                          再选择一条记录，即可查看相对基准的差异。
                        </p>
                      )}
                      {stage === "SEQUENCING" && (
                        <p className="ws-helper">
                          测序数据量以登记单为单位，同一登记单仅纳入一次；文本数据量不自动计算数值差异。
                        </p>
                      )}
                      <section className="ws-panel ws-loop">
                        <h3>
                          参数优化闭环 <span className="ws-planned">规划</span>
                        </h3>
                        <div>
                          {[
                            "比较记录",
                            "提出假设",
                            "人工确认",
                            "执行实验",
                            "验证结果",
                          ].map((label, i) => (
                            <span
                              key={label}
                              className={i === 0 ? "active" : ""}
                            >
                              <b>{i + 1}</b>
                              {label}
                              {i < 4 && <ArrowRight size={15} />}
                            </span>
                          ))}
                        </div>
                        <p>
                          当前支持对比与验证方案草稿，后续接入设备执行及结果回传。
                        </p>
                      </section>
                    </div>
                    <aside className="ws-panel ws-optimization">
                      <h3>
                        优化工作单 <span className="ws-planned">人工草稿</span>
                      </h3>
                      <p>先确定目标，再验证调整。</p>
                      <div className="ws-preview-field">
                        <label>优化目标</label>
                        <span>在验证方案中设定</span>
                      </div>
                      <div className="ws-preview-field">
                        <label>参数边界</label>
                        <span>明确允许调整的范围</span>
                      </div>
                      <hr />
                      <h4>当前观察</h4>
                      <p className="ws-observation">
                        {compared.length < 2
                          ? "选择至少两条实验记录后，可对照参数和结果。"
                          : "结果差异可能来自样本或执行条件，尚不能归因于单一参数。"}
                      </p>
                      <h4>下一步</h4>
                      <ol>
                        <li>核对样本与执行条件</li>
                        <li>设置目标和参数范围</li>
                        <li>创建下一轮验证方案</li>
                      </ol>
                      <button
                        className="ws-button primary"
                        disabled={compared.length < 2}
                        onClick={openPlan}
                      >
                        <FileText size={16} />
                        创建验证方案草稿
                      </button>
                      <small>
                        <AlertCircle size={15} />
                        当前未接入 AI；草稿不会自动执行。
                      </small>
                    </aside>
                  </div>
                )}
                {compareTab === "关联链路" && (
                  <section className="ws-panel ws-conditions">
                    <div className="ws-section-head">
                      <h3>对比记录的来源与条件</h3>
                      <span className="ws-small-note">
                        不同样本的结果需要结合背景判断
                      </span>
                    </div>
                    {compared.length ? (
                      compared.map((item) => {
                        const root = samples.find(
                          (s) => s.id === item.sampleId,
                        );
                        return (
                          <article key={item.id}>
                            <div>
                              <strong title={item.id}>
                                {shortId(item.id)}
                              </strong>
                              <Badge status={item.status} />
                            </div>
                            <p>
                              {item.sampleId} <ArrowRight size={13} />
                              {lineageFor(
                                item,
                                frozen
                                  ? [
                                      ...data.runs.filter(
                                        (r) =>
                                          !frozen.runs.some(
                                            (f) => f.id === r.id,
                                          ),
                                      ),
                                      ...frozen.runs,
                                    ]
                                  : data.runs,
                              )
                                .map(
                                  (r) => EXPERIMENT_CONFIG[r.type].shortLabel,
                                )
                                .join(" → ")}
                            </p>
                            <dl>
                              <div>
                                <dt>样本类型</dt>
                                <dd>
                                  {root ? SAMPLE_TYPES[root.type] : "未记录"}
                                </dd>
                              </div>
                              <div>
                                <dt>实验员</dt>
                                <dd>{item.operator}</dd>
                              </div>
                              <div>
                                <dt>协议版本</dt>
                                <dd>未记录</dd>
                              </div>
                              <div>
                                <dt>试剂批次</dt>
                                <dd>未记录</dd>
                              </div>
                            </dl>
                            <button
                              className="ws-text-button"
                              onClick={() => showRun(item)}
                            >
                              查看当前样本档案
                              <ArrowRight size={14} />
                            </button>
                          </article>
                        );
                      })
                    ) : (
                      <Empty title="尚未选择实验">
                        从左侧勾选要对比的记录。
                      </Empty>
                    )}
                  </section>
                )}
                {compareTab === "优化记录" && (
                  <section className="ws-panel ws-plans">
                    <div className="ws-section-head">
                      <h3>验证方案草稿</h3>
                      <span className="ws-small-note">
                        保存在当前浏览器 · 尚未执行
                      </span>
                    </div>
                    {data.plans.length ? (
                      data.plans.map((plan) => (
                        <article key={plan.id}>
                          <div>
                            <h3>{plan.title}</h3>
                            <span className="ws-badge draft">待人工确认</span>
                            <time>{formatDay(plan.date)}</time>
                          </div>
                          <dl>
                            <div>
                              <dt>优化目标</dt>
                              <dd>{plan.goal}</dd>
                            </div>
                            <div>
                              <dt>参数边界</dt>
                              <dd>{plan.bounds}</dd>
                            </div>
                            <div>
                              <dt>待验证假设</dt>
                              <dd>{plan.hypothesis}</dd>
                            </div>
                          </dl>
                          <footer>
                            <span>
                              依据：{plan.runs.length} 条实验记录的固定快照
                            </span>
                            <button
                              className="ws-text-button"
                              onClick={() =>
                                download(
                                  `${plan.title}.json`,
                                  JSON.stringify(plan, null, 2),
                                  "application/json",
                                )
                              }
                            >
                              <ArrowDownToLine size={15} />
                              导出方案
                            </button>
                            <button
                              className="ws-text-button"
                              onClick={() =>
                                restoreComparison({
                                  id: plan.id,
                                  name: plan.title,
                                  date: plan.date,
                                  runs: plan.runs,
                                  baseline: plan.baseline,
                                })
                              }
                            >
                              查看依据
                              <ArrowRight size={14} />
                            </button>
                          </footer>
                        </article>
                      ))
                    ) : (
                      <Empty title="还没有验证方案">
                        在“参数与结果”中选取至少两条记录，创建第一份验证方案草稿。
                      </Empty>
                    )}
                  </section>
                )}
              </>
            )}
            {page === "projects" && (
              <>
                <div className="ws-page-heading">
                  <div>
                    <h1>项目档案</h1>
                    <p>以项目组织样本、实验与结果。</p>
                  </div>
                  <button className="ws-button" onClick={openIntake}>
                    <Plus size={16} />
                    入库到项目
                  </button>
                </div>
                <section className="ws-panel ws-projects">
                  {projects.map((code) => {
                    const ss = samples.filter((s) => s.project === code),
                      rr = data.runs.filter((r) =>
                        ss.some((s) => s.id === r.sampleId),
                      );
                    return (
                      <article key={code}>
                        <span className="ws-project-icon">
                          <FolderOpen size={24} />
                        </span>
                        <div>
                          <h3>{code}</h3>
                          <p>
                            {ss.length} 份样本 <span>·</span> {rr.length} 条实验{" "}
                            <span>·</span>{" "}
                            {rr.filter((r) => r.status !== "submitted").length}{" "}
                            条待完成
                          </p>
                        </div>
                        <button
                          className="ws-button"
                          onClick={() => {
                            setProject(code);
                            selectSample(ss[0].id);
                            navigate("samples");
                          }}
                        >
                          查看样本
                          <ArrowRight size={15} />
                        </button>
                      </article>
                    );
                  })}
                  {!projects.length && (
                    <Empty title="还没有项目">
                      入库样本后，项目会显示在这里。
                    </Empty>
                  )}
                </section>
              </>
            )}
            {page === "monitor" && (
              <>
                <div className="ws-page-heading">
                  <div>
                    <h1>运行监控</h1>
                    <p>从人工记录开始，为设备协同准备统一的执行视图。</p>
                  </div>
                  <span className="ws-type-tag">设备接入规划中</span>
                </div>
                <section className="ws-panel ws-monitor">
                  <div className="ws-monitor-heading">
                    <span className="ws-monitor-icon">
                      <Activity size={30} />
                    </span>
                    <div>
                      <h2>当前运行模式：人工实验</h2>
                      <p>
                        已展示实验登记与结果状态；设备指令、遥测及自动调控尚未接入。
                      </p>
                    </div>
                  </div>
                  <div className="ws-experiment-summary">
                    <div>
                      <strong>
                        {
                          data.runs.filter((r) => r.status !== "submitted")
                            .length
                        }
                      </strong>
                      <span>待完成记录</span>
                    </div>
                    <div>
                      <strong>
                        {
                          data.runs.filter((r) => r.status === "submitted")
                            .length
                        }
                      </strong>
                      <span>已提交记录</span>
                    </div>
                    <div>
                      <strong>—</strong>
                      <span>设备状态 · 未接入</span>
                    </div>
                  </div>
                  <div className="ws-section-head">
                    <h3>近期登记记录</h3>
                    <span className="ws-small-note">
                      登记时间，不代表设备执行时间
                    </span>
                  </div>
                  {[...data.runs]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 5)
                    .map((item) => (
                      <button
                        className="ws-event"
                        key={item.id}
                        onClick={() => showRun(item)}
                      >
                        <Clock3 size={17} />
                        <time>{formatDay(item.date)}</time>
                        <span>{item.title}</span>
                        <Badge status={item.status} />
                        <ChevronRight size={15} />
                      </button>
                    ))}
                  <div className="ws-roadmap">
                    <h3>设备协同的后续接入点</h3>
                    <div>
                      <span>
                        <FileText size={20} />
                        结果文件与来源
                      </span>
                      <ArrowRight size={17} />
                      <span>
                        <Server size={20} />
                        任务下发与回执
                      </span>
                      <ArrowRight size={17} />
                      <span>
                        <Activity size={20} />
                        异常与执行监控
                      </span>
                    </div>
                  </div>
                </section>
              </>
            )}
            <footer className="ws-page-footer">
              <span>
                SampleDB <span>·</span> 样本与实验数据工作区
              </span>
              <span>
                {demo ? "数据保存在当前浏览器" : "本机实验室数据"}
                {published && (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href="https://github.com/NanyiCc/SampleDB"
                      target="_blank"
                      rel="noreferrer"
                    >
                      GitHub 源码
                    </a>{" "}
                    ·{" "}
                    <a href="https://github.com/NanyiCc/SampleDB/archive/refs/heads/main.zip">
                      下载源码
                    </a>
                  </>
                )}
              </span>
            </footer>
          </main>
        </div>
      )}
      {toast && (
        <div className="ws-toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <ModalFrame
          title={
            modal === "intake"
              ? "样本入库"
              : modal === "sampling"
                ? "新建取样登记"
                : modal === "result"
                  ? `${run ? EXPERIMENT_CONFIG[run.type].shortLabel : "实验"}结果${run?.status === "submitted" ? "详情" : "回填"}`
                  : modal === "plan"
                    ? "创建验证方案草稿"
                    : modal === "saved"
                      ? "已保存的对比"
                      : "恢复初始数据"
          }
          subtitle={
            modal === "result"
              ? run?.id
              : modal === "plan"
                ? "将当前实验记录固定为方案依据，后续由人工确认与执行。"
                : modal === "reset"
                  ? "仅恢复当前浏览器的数据，服务器数据库不受影响。"
                  : demo
                    ? "浏览器工作区 · 数据仅保存在当前浏览器"
                    : "对比和方案保存于当前浏览器"
          }
          close={() => {
            if (!busy) setModal(null);
          }}
        >
          {(modal === "intake" || modal === "sampling" || modal === "plan") && (
            <form onSubmit={submitDemo}>
              <div className="ws-modal-body ws-form-grid">
                {modal === "intake" && (
                  <>
                    {input("project", "项目 ID", "text", true)}
                    {input("name", "样本名称", "text", true)}
                    <label className="ws-field">
                      样本类型
                      <select
                        value={form.type}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, type: e.target.value }))
                        }
                      >
                        {Object.entries(SAMPLE_TYPES).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {input("tube", "冻存管 ID（唯一）", "text", true)}
                    {input("receivedAt", "收样日期", "date", true)}
                    {input("location", "储存位置")}
                    <p className="ws-full ws-helper">
                      样本编号会按项目自动生成，入库后可继续登记实验。
                    </p>
                  </>
                )}
                {modal === "sampling" && (
                  <>
                    <label className="ws-field ws-full">
                      取用样本
                      <select
                        aria-label="取用样本"
                        value={form.sourceId}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, sourceId: e.target.value }))
                        }
                        required
                      >
                        <option value="">请选择样本</option>
                        {samples.map((s) => (
                          <optgroup
                            label={`${s.id} · ${SAMPLE_TYPES[s.type]}`}
                            key={s.id}
                          >
                            <option value={s.id}>
                              {s.id} · 原始样本 · {s.tube}
                            </option>
                            {data.runs
                              .filter(
                                (r) =>
                                  r.sampleId === s.id &&
                                  r.status === "submitted",
                              )
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.id}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                    <label className="ws-field">
                      实验类型
                      <select
                        value={form.type}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, type: e.target.value }))
                        }
                      >
                        {Object.entries(EXPERIMENT_CONFIG).map(
                          ([key, value]) => (
                            <option value={key} key={key}>
                              {value.label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    {input("title", "登记标题")}
                    {input("inputAmount", "取样 / 投入量", "number", true)}
                    <label className="ws-field">
                      单位
                      <select
                        value={form.inputUnit}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, inputUnit: e.target.value }))
                        }
                      >
                        {["ng", "µL", "个", "片"].map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </label>
                    {form.type === "SEQUENCING" && (
                      <>
                        {input("chipNumber", "芯片编号", "text", true)}
                        {input("sequencingStrategy", "测序策略", "text", true)}
                      </>
                    )}
                    <p className="ws-helper ws-full">
                      单细胞取样关联原始冻存管；测序取用已提交的建库文库。
                    </p>
                  </>
                )}
                {modal === "plan" && (
                  <>
                    <div className="ws-full">
                      {input("title", "方案名称", "text", true)}
                    </div>
                    <label className="ws-field ws-full">
                      优化目标
                      <textarea
                        required
                        value={form.goal}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, goal: e.target.value }))
                        }
                        placeholder="明确希望改善的结果指标及评价方式"
                        rows={2}
                      />
                    </label>
                    <label className="ws-field ws-full">
                      参数边界
                      <textarea
                        required
                        value={form.bounds}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, bounds: e.target.value }))
                        }
                        placeholder="填写允许改变的参数、范围，以及保持不变的条件"
                        rows={2}
                      />
                    </label>
                    <label className="ws-field ws-full">
                      待验证假设
                      <textarea
                        required
                        value={form.hypothesis}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, hypothesis: e.target.value }))
                        }
                        placeholder="说明本轮计划验证什么，以及如何判断结果"
                        rows={3}
                      />
                    </label>
                    <p className="ws-helper ws-full">
                      已关联 {compared.length}{" "}
                      条实验记录。草稿不修改历史参数，也不会自动下发任务。
                    </p>
                  </>
                )}
                {formError && (
                  <p role="alert" className="ws-form-error ws-full">
                    {formError}
                  </p>
                )}
              </div>
              <footer className="ws-modal-footer">
                <button
                  type="button"
                  className="ws-button"
                  onClick={() => setModal(null)}
                >
                  取消
                </button>
                <button className="ws-button primary" type="submit">
                  <Check size={16} />
                  {modal === "intake"
                    ? "确认入库"
                    : modal === "sampling"
                      ? "创建登记"
                      : "保存方案草稿"}
                </button>
              </footer>
            </form>
          )}
          {modal === "result" && run && (
            <form onSubmit={saveResult}>
              <div className="ws-modal-body">
                <fieldset
                  disabled={run.status === "submitted" || busy}
                  className="ws-form-grid"
                >
                  {resultFields.map((field) => (
                    <label
                      className={`ws-field ${field.type === "textarea" ? "ws-full" : ""}`}
                      key={field.key}
                    >
                      {field.label}
                      {field.unit ? `（${field.unit}）` : ""}
                      {field.required ? " *" : ""}
                      {field.type === "select" ? (
                        <select
                          value={form[field.key] ?? ""}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              [field.key]: e.target.value,
                            }))
                          }
                        >
                          <option value="">请选择</option>
                          {field.options?.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : field.type === "textarea" ? (
                        <textarea
                          value={form[field.key] ?? ""}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              [field.key]: e.target.value,
                            }))
                          }
                          rows={3}
                        />
                      ) : (
                        <input
                          value={form[field.key] ?? ""}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              [field.key]: e.target.value,
                            }))
                          }
                          type={
                            field.type === "number" || field.type === "integer"
                              ? "number"
                              : field.type === "date"
                                ? "date"
                                : "text"
                          }
                          {...(field.type === "number" ||
                          field.type === "integer"
                            ? {
                                min: 0,
                                step: field.type === "integer" ? "1" : "any",
                              }
                            : {})}
                          placeholder="未记录"
                        />
                      )}
                    </label>
                  ))}
                  {run.type === "TISSUE_SECTION" && (
                    <>
                      {input("sliceCount", "切片张数", "number")}
                      <label className="ws-field ws-full">
                        切片明细（刀数 knifeCount、厚度 thickness / µm）
                        <textarea
                          rows={4}
                          value={form.sliceDetails || ""}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              sliceDetails: e.target.value,
                            }))
                          }
                          placeholder={'[{"knifeCount":1,"thickness":10}]'}
                        />
                      </label>
                    </>
                  )}
                  <label className="ws-field ws-full">
                    备注
                    <textarea
                      rows={2}
                      value={form.remark ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, remark: e.target.value }))
                      }
                    />
                  </label>
                </fieldset>
                {run.status === "submitted" && (
                  <p className="ws-helper">
                    已提交的记录只读，保留实际实验参数与结果。
                  </p>
                )}
                {formError && (
                  <p role="alert" className="ws-form-error">
                    {formError}
                  </p>
                )}
              </div>
              <footer className="ws-modal-footer">
                <button
                  type="button"
                  className="ws-button"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  关闭
                </button>
                {run.status !== "submitted" && (
                  <>
                    <button
                      className="ws-button"
                      name="mode"
                      value="draft"
                      type="submit"
                      disabled={busy}
                    >
                      <Save size={15} />
                      暂存
                    </button>
                    <button
                      className="ws-button primary"
                      name="mode"
                      value="submit"
                      type="submit"
                      disabled={busy}
                    >
                      <Check size={15} />
                      {busy ? "保存中…" : "提交结果"}
                    </button>
                  </>
                )}
              </footer>
            </form>
          )}
          {modal === "saved" && (
            <div className="ws-modal-body">
              {data.comparisons.length ? (
                [...data.comparisons].reverse().map((item) => (
                  <button
                    className="ws-saved-item"
                    key={item.id}
                    onClick={() => restoreComparison(item)}
                  >
                    <BookOpen size={19} />
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {formatDay(item.date)} · {item.runs.length} 条实验 ·
                        固定快照
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))
              ) : (
                <Empty title="还没有保存的对比">
                  选取至少两条记录后，点击“保存对比”。
                </Empty>
              )}
            </div>
          )}
          {modal === "reset" && (
            <>
              <div className="ws-modal-body">
                <p>
                  当前浏览器中新增的样本、实验、对比快照和验证方案将被清除，并恢复初始数据。
                </p>
                <p className="ws-helper">这项操作仅作用于当前浏览器。</p>
              </div>
              <footer className="ws-modal-footer">
                <button className="ws-button" onClick={() => setModal(null)}>
                  保留当前数据
                </button>
                <button
                  className="ws-button primary"
                  onClick={() => {
                    initialize(createDemoData());
                    setRunId("");
                    setFrozen(null);
                    setQuery("");
                    setProject("");
                    setTypeFilter("");
                    setStage("LIBRARY");
                    setSampleTab("关联链路");
                    setCompareTab("参数与结果");
                    navigate("samples");
                    setModal(null);
                    setToast("已恢复初始数据。");
                  }}
                >
                  <RotateCcw size={16} />
                  恢复初始数据
                </button>
              </footer>
            </>
          )}
        </ModalFrame>
      )}
    </div>
  );

  function renderRunTable(rows: WorkspaceRun[]) {
    return (
      <section className="ws-panel ws-table-panel">
        {rows.length ? (
          <div className="ws-table-scroll">
            <table className="ws-run-table">
              <thead>
                <tr>
                  <th>实验 / 派生样本</th>
                  <th>实验类型</th>
                  <th>实验员</th>
                  <th>登记日期</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button
                        onClick={() => showRun(item)}
                        className="ws-table-title"
                      >
                        <strong>{item.title}</strong>
                        <small title={item.id}>{shortId(item.id)}</small>
                      </button>
                    </td>
                    <td>{EXPERIMENT_CONFIG[item.type].shortLabel}</td>
                    <td>{item.operator}</td>
                    <td>{formatDay(item.date)}</td>
                    <td>
                      <Badge status={item.status} />
                    </td>
                    <td>
                      <button
                        className="ws-text-button"
                        onClick={() =>
                          item.status === "submitted"
                            ? addToCompare(item)
                            : showRun(item)
                        }
                      >
                        {item.status === "submitted"
                          ? "加入对比"
                          : "查看 / 回填"}
                        <ArrowRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="没有符合条件的实验">
            调整筛选，或登记一次新的取样。
          </Empty>
        )}
      </section>
    );
  }
}

function FragmentRows({
  title,
  metrics,
  runs,
  baseline,
}: {
  title: string;
  metrics: ReturnType<typeof metricsFor>;
  runs: WorkspaceRun[];
  baseline: WorkspaceRun | undefined;
}) {
  if (!metrics.length) return null;
  return (
    <>
      <tr className="ws-matrix-group">
        <th colSpan={runs.length + 1}>{title}</th>
      </tr>
      {metrics.map((metric) => (
        <tr key={metric.key}>
          <th>
            {metric.label}
            {metric.unit && <span>（{metric.unit}）</span>}
          </th>
          {runs.map((run) => {
            const value = metricValue(run, metric),
              reference = baseline ? metricValue(baseline, metric) : null;
            const changed =
              baseline?.id !== run.id && !sameMetric(value, reference);
            const delta =
              metric.numeric && baseline?.id !== run.id
                ? numericDelta(value, reference)
                : null;
            return (
              <td
                key={run.id}
                className={`${value === null ? "missing" : ""} ${changed ? "changed" : ""}`}
              >
                <span title={display(value)}>{display(value)}</span>
                {delta !== null && delta !== 0 && (
                  <small
                    className="ws-delta"
                    title={`与基准相差 ${delta}${metric.unit ?? ""}`}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </small>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
