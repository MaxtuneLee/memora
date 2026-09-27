export interface EvidenceWindow {
  lectureId: string;
  startCueId: string;
  endCueId: string;
  startMs: number;
  endMs: number;
}

export interface EvaluationQuestion {
  questionId: string;
  question: string;
  lectureIds: string[];
  // Required groups; windows inside a group are alternatives.
  evidence: Array<Array<EvidenceWindow>>;
  requiredPoints: string[];
  disallowedClaims?: string[];
  kind: "localized" | "paraphrase" | "shared-term" | "two-segment";
  reviewerNote?: string;
}

/** A `<memora-jump />` tag parsed from the final answer. */
export interface AgentCitation {
  fileId: string;
  startSec: number;
  endSec: number;
}

export interface TranscriptCue {
  cueId: string;
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

/** What the playground import produced, as plain data. */
export interface AgentEvaluationCorpus {
  /** Imported file ID → lecture ID. */
  fileLectures: Record<string, string>;
  /** Cue file contents per lecture ID; the judge sees the text around the cited cues. */
  cues: Record<string, TranscriptCue[]>;
  /** Lecture ID → the name its file carries, so the judge can tell a title from a claim. */
  lectureNames?: Record<string, string>;
  revisions: {
    /** SHA-256 of the questions file. */
    questions: string;
    /** SHA-256 of each transcript file, by lecture ID. */
    transcripts: Record<string, string>;
    transcriptVersion: string;
    converterVersion: string;
  };
}

export interface AgentIdentity {
  adapter: string;
  model: string;
  promptRevision: string;
  tools: string[];
  /** Inference settings and other pinned configuration, such as `personality: "none"`. */
  settings: Record<string, string | number | boolean | null>;
}

/** The agent sees only the question text, never the answer key. */
export type AgentQuestion = Pick<EvaluationQuestion, "questionId" | "question">;

export interface AgentAnswer {
  answer: string;
  citations: AgentCitation[];
  /** The Trace of this attempt lives at this session and Run. */
  sessionId: string;
  runId: string | null;
  usage?: Record<string, number>;
  /**
   * Summed over every model call in the Run's Trace, summaries included; absent without a settled
   * Trace. `input` excludes prompt-cache hits, counted in `cached` (absent in older results).
   */
  tokens?: { input: number; cached?: number; output: number };
  fallbackTrims: number | "unknown";
}

/** Where an attempt's Trace lives, and what was read from it. */
export type AttemptTrace = Pick<AgentAnswer, "sessionId" | "runId" | "fallbackTrims" | "tokens">;

export interface AgentAdapter {
  identity: AgentIdentity;
  answer(question: AgentQuestion, signal: AbortSignal): Promise<AgentAnswer>;
}

export interface JudgeIdentity {
  judge: string;
  model: string;
  promptVersion: string;
}

export interface JudgeInput {
  question: string;
  requiredPoints: string[];
  disallowedClaims: string[];
  /** Cues overlapping each citation, widened by `JUDGE_CONTEXT_SEC` on both sides. */
  citedCues: Array<TranscriptCue & { lectureId: string }>;
  lectureNames: Record<string, string>;
  answer: string;
}

export interface JudgeVerdict {
  /** One decision per required point, in input order. */
  requiredPoints: Array<{ point: string; supported: boolean; confidence: number }>;
  /** One decision per disallowed claim, in input order. */
  disallowedClaims: Array<{ claim: string; present: boolean; confidence: number }>;
  /** Whether the answer states facts the transcript contradicts or never mentions; reported only. */
  unsupportedClaims: { present: boolean; confidence: number };
  rawOutput: string;
}

export interface JudgeAdapter {
  identity: JudgeIdentity;
  judge(input: JudgeInput, signal: AbortSignal): Promise<JudgeVerdict>;
}

export interface CitationScore {
  scorerVersion: number;
  retrieval: {
    passed: boolean;
    /** Per evidence group: hit, and the distance in seconds (null when no citation is in its lecture). */
    groups: Array<{ hit: boolean; distanceSec: number | null }>;
  };
  timestamp: {
    medianDistanceSec: number | null;
    withinToleranceShare: number | null;
    uncitedGroups: number;
  };
  /** Share of citations that hit any window of the question; null without citations. */
  citationPrecision: number | null;
}

export type AttemptFailureReason = "error" | "timeout" | "judge-error";

export interface AgentAttemptResult {
  questionId: string;
  attempt: number;
  passed: boolean;
  /** Retrieval passed and no gating judge decision failed, but one was too close to call. */
  uncertain?: boolean;
  latencyMs: number;
  answer?: AgentAnswer;
  /** The Trace of an attempt that failed without an answer, when the adapter reported it. */
  trace?: AttemptTrace;
  score?: CitationScore;
  coverage?: { passed: boolean; verdict: JudgeVerdict };
  failure?: { reason: AttemptFailureReason; name: string; message: string };
}

export interface AgentEvaluationSummary {
  plannedAttempts: number;
  completedAttempts: number;
  passed: number;
  retrievalPassed: number;
  coveragePassed: number;
  /** Absent in results saved before uncertain attempts were counted. */
  uncertain?: number;
  failures: Record<AttemptFailureReason, number>;
  medianDistanceSec: number | null;
  questions: Array<{ questionId: string; passes: number; attempts: number }>;
}

export interface AgentEvaluationResult {
  formatVersion: 1;
  kind: "agent";
  evaluationId: string;
  status: "completed" | "canceled";
  startedAt: string;
  finishedAt: string;
  agent: AgentIdentity;
  judge: JudgeIdentity;
  revisions: AgentEvaluationCorpus["revisions"];
  config: {
    scorerVersion: number;
    concurrency: number;
    attemptsPerQuestion: number;
    attemptTimeoutMs: number;
    toleranceSec: number;
  };
  /** The questions with their answer keys; absent in results saved before they were stored. */
  questions?: EvaluationQuestion[];
  /** Imported file ID → lecture ID; absent in results saved before it was stored. */
  fileLectures?: Record<string, string>;
  attempts: AgentAttemptResult[];
  summary: AgentEvaluationSummary;
}

export interface AgentEvaluationProgress {
  completed: number;
  total: number;
  attempt: AgentAttemptResult;
}

export interface RunAgentEvaluationOptions {
  questions: EvaluationQuestion[];
  corpus: AgentEvaluationCorpus;
  agent: AgentAdapter;
  judge: JudgeAdapter;
  /** Attempts running at once; default 3. */
  concurrency?: number;
  /** Per-attempt limit covering the agent and the judge; default 5 minutes. */
  attemptTimeoutMs?: number;
  signal?: AbortSignal;
  /** How long a timed-out attempt waits for the adapter to report its Trace; default 10 seconds. */
  traceWaitMs?: number;
  onProgress?: (progress: AgentEvaluationProgress) => void;
  now?: () => Date;
  createId?: () => string;
}
