export type EvalCaseResult = {
  query: string;
  expectedContains: string[];
  answer: string;
  passed: boolean;
  latencyMs: number;
};

export type EvalSummary = {
  total: number;
  passed: number;
  passRate: number;
  avgLatencyMs: number;
};

export function summarizeEval(results: EvalCaseResult[]): EvalSummary {
  const total = results.length;
  const passed = results.filter((result) => result.passed).length;
  const avgLatencyMs =
    results.length === 0
      ? 0
      : Math.round(results.reduce((sum, result) => sum + result.latencyMs, 0) / results.length);

  return {
    total,
    passed,
    passRate: total === 0 ? 0 : passed / total,
    avgLatencyMs,
  };
}
