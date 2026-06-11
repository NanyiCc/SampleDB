export const SAMPLE_TYPES = {
  TISSUE: "组织",
  CDNA: "cDNA"
} as const;

export type SampleType = keyof typeof SAMPLE_TYPES;

export const EXPERIMENT_CONFIG = {
  ENRICHMENT: {
    label: "富集结果",
    shortLabel: "富集",
    suffix: "T",
    accent: "#0f766e"
  },
  ARRAY: {
    label: "阵列生成",
    shortLabel: "阵列",
    suffix: "A",
    accent: "#b45309"
  },
  LIGATION: {
    label: "连接结果",
    shortLabel: "连接",
    suffix: "L",
    accent: "#be123c"
  },
  LIBRARY: {
    label: "建库",
    shortLabel: "建库",
    suffix: "LIB",
    accent: "#4338ca"
  },
  SEQUENCING: {
    label: "测序上机",
    shortLabel: "测序",
    suffix: "SEQ",
    accent: "#2563eb"
  },
  TISSUE_SECTION: {
    label: "组织切片",
    shortLabel: "切片",
    suffix: "SEC",
    accent: "#7c3aed"
  },
  SECTION_PLACEMENT: {
    label: "实贴片",
    shortLabel: "贴片",
    suffix: "SLD",
    accent: "#0891b2"
  },
  CDNA_PREP: {
    label: "制取cDNA",
    shortLabel: "制取",
    suffix: "CDNA",
    accent: "#16a34a"
  }
} as const;

export type ExperimentType = keyof typeof EXPERIMENT_CONFIG;

export const PROJECT_CODE_PATTERN = /^[A-Z0-9]{1,9}$/;
export const PROJECT_CODE_RULE_TEXT = "项目 ID 必须是 1 到 9 位字母或数字，例如 ABC、LAB01。";

export function normalizeProjectCode(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeSampleId(value: string) {
  return value.trim().toUpperCase();
}

export function formatSampleId(projectCode: string, sequence: number) {
  return `${projectCode}-${String(sequence).padStart(4, "0")}`;
}

export function formatDerivedSampleId(sourceSampleId: string, suffix: string, sequence: number) {
  return `${sourceSampleId}-${suffix}${String(sequence).padStart(2, "0")}`;
}

export function formatDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}
