import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  EXPERIMENT_CONFIG,
  ExperimentType
} from "@/lib/domain";

export type FieldType = "text" | "number" | "integer" | "select" | "combobox" | "textarea" | "date";

export type FieldConfig = {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  required?: boolean;
  options?: string[];
  optionSource?: "storageLocations";
};

export type LabFormConfig = {
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

const CONFIG_FILE = "lab-form-config.json";
const CONFIG_CACHE_MS = 1000;

const SAMPLE_FIELD_KEYS = new Set([
  "volume",
  "concentration",
  "storageLocation",
  "tissueSource",
  "originalFragmentDistribution"
]);
const RESULT_FIELD_KEYS = new Set([
  "volume",
  "concentration",
  "storageLocation",
  "fragmentDistribution",
  "experimentMethod",
  "generationStrategy",
  "inputAmount",
  "outputVolume",
  "libraryDuration",
  "libraryStrategy",
  "absorbance260280",
  "absorbance260230",
  "barcode",
  "sliceCount",
  "sliceDetails",
  "chipId",
  "imageStorageLocation",
  "qc",
  "fragmentLength",
  "experimenter",
  "experimentDate",
  "cellCountInstrument",
  "viability",
  "cellConcentrationDirect",
  "cellConcentrationDiluted",
  "averageDiameter",
  "aggregationRate",
  "nucleatedRate",
  "expectedCellCapture",
  "loadingCellCount",
  "loadingVolume",
  "csbVolume",
  "resuspensionBuffer",
  "riskOnInstrument",
  "remainingSample",
  "hasCryopreservedCells",
  "experimentOperation",
  "libraryDate",
  "pipStorageLocation",
  "cdnaConcentration",
  "cdnaFragmentLength",
  "cdnaPeakPath",
  "libraryConcentration",
  "libraryFragmentLength",
  "libraryPeakPath"
]);
const SEQUENCING_FIELD_KEYS = new Set([
  "dataAmount",
  "uploadPath",
  "sequencingStrategy",
  "barcode"
]);
const FIELD_TYPES = new Set<FieldType>(["text", "number", "integer", "select", "combobox", "textarea", "date"]);

export const DEFAULT_LAB_FORM_CONFIG: Omit<LabFormConfig, "path" | "loadedAt" | "error"> = {
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
    SINGLE_CELL: [
      { key: "experimenter", label: "实验员", type: "text" },
      { key: "experimentDate", label: "实验日期", type: "date" },
      { key: "cellCountInstrument", label: "计数仪", type: "text" },
      { key: "viability", label: "活率", type: "number", unit: "%" },
      { key: "cellConcentrationDirect", label: "细胞浓度（直接计数）", type: "number", unit: "个/µL" },
      { key: "cellConcentrationDiluted", label: "细胞浓度（稀释计数）", type: "number", unit: "个/µL" },
      { key: "averageDiameter", label: "平均直径", type: "number", unit: "µm" },
      { key: "aggregationRate", label: "结团率", type: "number", unit: "%" },
      { key: "nucleatedRate", label: "有核率", type: "number", unit: "%" },
      { key: "expectedCellCapture", label: "预期细胞捕获数", type: "text" },
      { key: "loadingCellCount", label: "上机细胞数", type: "text" },
      { key: "loadingVolume", label: "上机体积", type: "number", unit: "µL" },
      { key: "csbVolume", label: "CSB 体积", type: "number", unit: "µL" },
      { key: "resuspensionBuffer", label: "重悬 buffer", type: "text" },
      { key: "riskOnInstrument", label: "是否风险上机", type: "text" },
      { key: "remainingSample", label: "样本剩余情况", type: "text" },
      { key: "hasCryopreservedCells", label: "是否有细胞冻存", type: "text" },
      {
        key: "experimentOperation",
        label: "实验操作（其他需要备注的内容）",
        type: "textarea"
      },
      { key: "libraryDate", label: "建库日期", type: "date" },
      { key: "pipStorageLocation", label: "pip 存放点", type: "text" },
      { key: "cdnaConcentration", label: "cDNA 浓度", type: "number", unit: "ng/µL" },
      { key: "cdnaFragmentLength", label: "cDNA 片段", type: "text", unit: "bp" },
      { key: "cdnaPeakPath", label: "cDNA 峰图保存路径", type: "text" },
      { key: "libraryConcentration", label: "文库浓度", type: "number", unit: "ng/µL" },
      { key: "libraryFragmentLength", label: "文库片段", type: "text", unit: "bp" },
      { key: "libraryPeakPath", label: "文库峰图保存路径", type: "text" }
    ],
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
  hideStorageLocationForExperiments: ["SEQUENCING"]
};

let writeQueue = Promise.resolve();
let cachedConfig: LabFormConfig | null = null;
let cachedAt = 0;

export function labFormConfigPath() {
  return path.join(process.cwd(), CONFIG_FILE);
}

export async function loadLabFormConfig(options: { force?: boolean } = {}): Promise<LabFormConfig> {
  const configPath = labFormConfigPath();
  const now = Date.now();

  if (!options.force && cachedConfig && now - cachedAt < CONFIG_CACHE_MS) {
    return cachedConfig;
  }

  try {
    const raw = JSON.parse(await readFile(configPath, "utf-8")) as Partial<LabFormConfig>;
    const config = normalizeConfig(raw, configPath, null);
    cachedConfig = config;
    cachedAt = now;
    return config;
  } catch (error) {
    const config = normalizeConfig(
      DEFAULT_LAB_FORM_CONFIG,
      configPath,
      error instanceof Error ? error.message : "表单配置读取失败。"
    );
    cachedConfig = config;
    cachedAt = now;
    return config;
  }
}

export async function addStorageLocationToConfig(value: string | null | undefined) {
  const location = value?.trim();
  if (!location) {
    return;
  }

  writeQueue = writeQueue.then(async () => {
    const config = await loadLabFormConfig({ force: true });
    if (config.storageLocations.includes(location)) {
      return;
    }

    const nextConfig = {
      version: config.version,
      storageLocations: [...config.storageLocations, location],
      sampleIntakeFields: config.sampleIntakeFields,
      experimentResultFields: config.experimentResultFields,
      sequencingResultFields: config.sequencingResultFields,
      hideStorageLocationForExperiments: config.hideStorageLocationForExperiments
    };
    const configPath = labFormConfigPath();
    const tempPath = `${configPath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf-8");
    await rename(tempPath, configPath);
    cachedConfig = normalizeConfig(nextConfig, configPath, null);
    cachedAt = Date.now();
  });

  await writeQueue;
}

function normalizeConfig(
  raw: Partial<LabFormConfig>,
  configPath: string,
  error: string | null
): LabFormConfig {
  const version = Number(raw.version ?? DEFAULT_LAB_FORM_CONFIG.version);
  const storageLocations = normalizeStringArray(
    raw.storageLocations,
    DEFAULT_LAB_FORM_CONFIG.storageLocations
  );
  const sampleIntakeFields = normalizeFields(
    raw.sampleIntakeFields,
    DEFAULT_LAB_FORM_CONFIG.sampleIntakeFields,
    SAMPLE_FIELD_KEYS
  );
  const experimentResultFields = Object.keys(EXPERIMENT_CONFIG).reduce(
    (fields, type) => ({
      ...fields,
      [type]: normalizeFields(
        raw.experimentResultFields?.[type as ExperimentType],
        DEFAULT_LAB_FORM_CONFIG.experimentResultFields[type as ExperimentType],
        RESULT_FIELD_KEYS
      )
    }),
    {} as Record<ExperimentType, FieldConfig[]>
  );
  const sequencingResultFields = normalizeFields(
    raw.sequencingResultFields,
    DEFAULT_LAB_FORM_CONFIG.sequencingResultFields,
    SEQUENCING_FIELD_KEYS
  );
  const hideStorageLocationForExperiments = normalizeExperimentTypes(
    raw.hideStorageLocationForExperiments,
    DEFAULT_LAB_FORM_CONFIG.hideStorageLocationForExperiments
  );

  return {
    version,
    storageLocations,
    sampleIntakeFields,
    experimentResultFields,
    sequencingResultFields,
    hideStorageLocationForExperiments,
    path: configPath,
    loadedAt: new Date().toISOString(),
    error
  };
}

function normalizeFields(
  rawFields: unknown,
  fallback: FieldConfig[],
  allowedKeys: Set<string>
) {
  if (!Array.isArray(rawFields)) {
    return fallback;
  }

  const fields = rawFields
    .map((field) => normalizeField(field, allowedKeys))
    .filter((field): field is FieldConfig => Boolean(field));

  return fields.length > 0 ? fields : fallback;
}

function normalizeField(raw: unknown, allowedKeys: Set<string>) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const field = raw as Partial<FieldConfig>;
  const key = typeof field.key === "string" ? field.key : "";
  const label = typeof field.label === "string" ? field.label : "";
  const type = field.type;

  if (!allowedKeys.has(key) || !label || !type || !FIELD_TYPES.has(type)) {
    return null;
  }

  return {
    key,
    label,
    type,
    ...(typeof field.unit === "string" ? { unit: field.unit } : {}),
    ...(typeof field.required === "boolean" ? { required: field.required } : {}),
    ...(Array.isArray(field.options) ? { options: normalizeStringArray(field.options, []) } : {}),
    ...(field.optionSource === "storageLocations" ? { optionSource: field.optionSource } : {})
  };
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = Array.from(
    new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))
  );
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeExperimentTypes(value: unknown, fallback: ExperimentType[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value.filter(
    (item): item is ExperimentType => typeof item === "string" && item in EXPERIMENT_CONFIG
  );
  return normalized.length > 0 ? normalized : fallback;
}
