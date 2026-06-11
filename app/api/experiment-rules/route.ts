import { NextResponse } from "next/server";
import { EXPERIMENT_CONFIG } from "@/lib/domain";
import { loadExperimentRuleConfig } from "@/lib/experiment-rules";

export const runtime = "nodejs";

export async function GET() {
  const config = await loadExperimentRuleConfig();

  return NextResponse.json({
    ...config,
    rules: config.rules.map((rule) => ({
      ...rule,
      allowedLabels: rule.allowedExperiments.map((type) => EXPERIMENT_CONFIG[type].label)
    }))
  });
}
