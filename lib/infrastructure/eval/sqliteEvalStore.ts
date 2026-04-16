import fs from "node:fs";
import path from "node:path";
import { EvalCaseResult, EvalSummary } from "@/lib/application/eval/metrics";

type StoredEval = {
  summary: EvalSummary;
  results: EvalCaseResult[];
  createdAt: string;
};

export function storeEvalResult(projectId: string, payload: { summary: EvalSummary; results: EvalCaseResult[] }) {
  const dir = path.join(process.cwd(), "data", "eval");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const target = path.join(dir, `${projectId}.json`);
  const body: StoredEval = {
    ...payload,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(target, JSON.stringify(body, null, 2), "utf8");
}
