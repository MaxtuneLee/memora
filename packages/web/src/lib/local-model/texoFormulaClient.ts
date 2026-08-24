import type { LocalFormulaEvent, LocalModelExecutionBackend } from "@memora/local-model-runtime";

import { modelWorkerFactory, type ModelWorkerFactory } from "../model-worker";

export interface TexoFormulaProgress {
  label: string;
  progress?: number;
}

export class TexoFormulaClient {
  private backend: LocalModelExecutionBackend | null = null;
  private readonly workerFactory: ModelWorkerFactory;

  constructor(workerFactory: ModelWorkerFactory = modelWorkerFactory) {
    this.workerFactory = workerFactory;
  }

  async preload(onProgress?: (progress: TexoFormulaProgress) => void): Promise<void> {
    await this.run({ kind: "formula.preload", input: {} }, onProgress);
  }

  async recognize(
    blob: Blob,
    onProgress?: (progress: TexoFormulaProgress) => void,
  ): Promise<string> {
    return (await this.run({ kind: "formula.recognize", input: { blob } }, onProgress)) ?? "";
  }

  getBackend(): string {
    return this.backend ? `${this.backend.toUpperCase()} shared worker` : "unknown";
  }

  private async run(
    task:
      | { kind: "formula.preload"; input: Record<string, never> }
      | { kind: "formula.recognize"; input: { blob: Blob } },
    onProgress?: (progress: TexoFormulaProgress) => void,
  ): Promise<string | null> {
    let latex: string | null = null;
    for await (const event of this.workerFactory.run("formula", {
      priority: "interactive",
      task,
    }) as AsyncGenerator<LocalFormulaEvent>) {
      if (event.type === "backend") {
        this.backend = event.backend;
      } else if (event.type === "model-progress") {
        onProgress?.({ label: event.file ?? "Loading Texo FormulaNet", progress: event.progress });
      } else if (event.type === "error") {
        throw new Error(event.error.message);
      } else if (event.type === "formula-complete") {
        latex = event.latex;
      }
    }
    return latex;
  }
}

export const texoFormulaClient = new TexoFormulaClient();
