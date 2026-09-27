import type { DatasetSelection } from "@memora/datasets";
import type {
  AgentAnswer,
  AgentEvaluationCorpus,
  AgentEvaluationProgress,
  AgentEvaluationResult,
  AgentIdentity,
  AgentQuestion,
  AttemptTrace,
  EvaluationProgress,
  EvaluationQuestion,
  EvaluationResult,
  JudgeIdentity,
  JudgeInput,
  JudgeVerdict,
} from "@memora/evaluation";

export type EvaluationWorkerRequest =
  | {
      id: string;
      type: "run";
      selection: DatasetSelection;
      modelId: string;
      language: string;
    }
  | {
      id: string;
      type: "run-agent";
      questions: EvaluationQuestion[];
      corpus: AgentEvaluationCorpus;
      /** The adapters stay in the Window; the worker relays calls to them. */
      agent: AgentIdentity;
      judge: JudgeIdentity;
      concurrency?: number;
    }
  | { id: string; type: "cancel"; targetId: string }
  | { id: string; type: "model-result"; targetId: string; prediction?: string; error?: string }
  | {
      id: string;
      type: "adapter-result";
      targetId: string;
      value?: AgentAnswer | JudgeVerdict;
      error?: string;
      /** The Trace of a failed or canceled agent attempt. */
      trace?: AttemptTrace;
    };

export type EvaluationWorkerResponse =
  | { id: string; type: "progress"; progress: EvaluationProgress }
  | { id: string; type: "result"; result: EvaluationResult }
  | { id: string; type: "agent-progress"; progress: AgentEvaluationProgress }
  | { id: string; type: "agent-result"; result: AgentEvaluationResult }
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
  | {
      id: string;
      type: "adapter-request";
      runId: string;
      adapter: "agent";
      question: AgentQuestion;
    }
  | { id: string; type: "adapter-request"; runId: string; adapter: "judge"; input: JudgeInput }
  /** Aborts a model or adapter request the Window is serving. */
  | { id: string; type: "model-cancel"; targetId: string };
