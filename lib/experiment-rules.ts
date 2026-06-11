import { readFile } from "node:fs/promises";
import path from "node:path";
import { EXPERIMENT_CONFIG, ExperimentType, normalizeSampleId } from "@/lib/domain";

type RawExperimentRule = {
  sampleId?: string;
  sampleIdPrefix?: string;
  allowedExperiments?: string[];
  note?: string;
};

export type ExperimentRule = {
  sampleId?: string;
  sampleIdPrefix?: string;
  allowedExperiments: ExperimentType[];
  note?: string;
};

export type ExperimentRuleConfig = {
  version: number;
  rules: ExperimentRule[];
  path: string;
  loadedAt: string;
  error: string | null;
};

const CONFIG_FILE = "sample-experiment-rules.json";

export function experimentRuleConfigPath() {
  return path.join(process.cwd(), CONFIG_FILE);
}

export async function loadExperimentRuleConfig(): Promise<ExperimentRuleConfig> {
  const configPath = experimentRuleConfigPath();

  try {
    const raw = JSON.parse(await readFile(configPath, "utf-8")) as {
      version?: number;
      rules?: RawExperimentRule[];
    };
    const rules = (Array.isArray(raw.rules) ? raw.rules : [])
      .map(normalizeRule)
      .filter((rule): rule is ExperimentRule => Boolean(rule));

    return {
      version: Number(raw.version ?? 1),
      rules,
      path: configPath,
      loadedAt: new Date().toISOString(),
      error: null
    };
  } catch (error) {
    return {
      version: 1,
      rules: [],
      path: configPath,
      loadedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "实验限制配置读取失败。"
    };
  }
}

export async function validateExperimentRule(
  sampleIds: string[],
  experimentType: ExperimentType
) {
  const config = await loadExperimentRuleConfig();

  if (config.error) {
    return {
      config,
      violations: [`实验限制配置读取失败：${config.error}`]
    };
  }

  const violations = sampleIds.flatMap((sampleId) => {
    const rule = findRuleForSample(config.rules, sampleId);
    if (!rule || rule.allowedExperiments.includes(experimentType)) {
      return [];
    }

    const allowedLabels = rule.allowedExperiments
      .map((type) => EXPERIMENT_CONFIG[type].label)
      .join("、");
    return [`${sampleId} 只能登记：${allowedLabels || "未配置任何实验"}`];
  });

  return { config, violations };
}

function normalizeRule(rule: RawExperimentRule): ExperimentRule | null {
  const sampleId = rule.sampleId ? normalizeSampleId(rule.sampleId) : undefined;
  const sampleIdPrefix = rule.sampleIdPrefix ? normalizeSampleId(rule.sampleIdPrefix) : undefined;
  const allowedExperiments = (rule.allowedExperiments ?? []).filter(
    (type): type is ExperimentType => type in EXPERIMENT_CONFIG
  );

  if ((!sampleId && !sampleIdPrefix) || allowedExperiments.length === 0) {
    return null;
  }

  return {
    ...(sampleId ? { sampleId } : {}),
    ...(sampleIdPrefix ? { sampleIdPrefix } : {}),
    allowedExperiments,
    ...(rule.note ? { note: rule.note } : {})
  };
}

function findRuleForSample(rules: ExperimentRule[], sampleId: string) {
  const normalized = normalizeSampleId(sampleId);
  return (
    rules.find((rule) => rule.sampleId === normalized) ??
    rules.find((rule) => rule.sampleIdPrefix && normalized.startsWith(rule.sampleIdPrefix))
  );
}
