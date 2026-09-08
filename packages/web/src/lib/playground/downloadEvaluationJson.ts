import type { EvaluationResult } from "@memora/evaluation";

export function downloadEvaluationJson(result: EvaluationResult): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${result.runId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
