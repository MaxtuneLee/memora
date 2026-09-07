import type { DatasetSelection } from "@memora/datasets";
import type { EvaluationProgress, EvaluationResult } from "@memora/evaluation";

export type EvaluationWorkerRequest =
  | {
      id: string;
      type: "run";
      selection: DatasetSelection;
      modelId: string;
      language: string;
    }
  | { id: string; type: "cancel"; targetId: string }
  | { id: string; type: "model-result"; targetId: string; prediction?: string; error?: string };

export type EvaluationWorkerResponse =
  | { id: string; type: "progress"; progress: EvaluationProgress }
  | { id: string; type: "result"; result: EvaluationResult }
  | { id: string; type: "error"; message: string }
  | {
      id: string;
      type: "model-request";
      operation: "preload";
      modelId: string;
    }
  | {
      id: string;
      type: "model-request";
      operation: "transcribe";
      modelId: string;
      language: string;
      pcm: Float32Array;
    }
  | { id: string; type: "model-cancel"; targetId: string };
