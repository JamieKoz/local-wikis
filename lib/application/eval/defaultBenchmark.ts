import { EvalCase } from "@/lib/application/eval/runEvalSuite";

export function getDefaultBenchmarkQueries(): EvalCase[] {
  return [
    {
      query: "Summarize the current project scope",
      expectedContains: ["project"],
    },
    {
      query: "What evidence files are indexed for this project?",
      expectedContains: ["source"],
    },
    {
      query: "List key decisions captured in notes",
      expectedContains: ["decision"],
    },
  ];
}
