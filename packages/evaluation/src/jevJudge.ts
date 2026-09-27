import type { JudgeAdapter, JudgeInput, JudgeVerdict } from "./agentTypes";

/** Bump when the questions sent to Jev change, so older verdicts stay distinguishable. */
export const JEV_PROMPT_VERSION = "jev-coverage-1";
export const JEV_DEFAULT_MODEL = "jev-latest";

interface NoulQuestion {
  type: "noul";
  instructions: string;
}

/** Body of TypeSafe AI's `POST /v1/systemone`: state plus named yes/no questions. */
export interface JevRequest {
  model: string;
  state: {
    question: string;
    answer: string;
    citedTranscript: Array<{
      lecture: string;
      cue: string;
      startSec: number;
      endSec: number;
      text: string;
    }>;
  };
  questions: Record<string, NoulQuestion>;
}

const noul = (instructions: string): NoulQuestion => ({ type: "noul", instructions });

export function buildJevRequest(input: JudgeInput, model: string): JevRequest {
  const questions: Record<string, NoulQuestion> = {};
  input.requiredPoints.forEach((point, index) => {
    questions[`point_${index}`] = noul(
      `Does the answer make this point, and does the cited transcript support it? Point: ${point}`,
    );
  });
  input.disallowedClaims.forEach((claim, index) => {
    questions[`disallowed_${index}`] = noul(`Does the answer make this claim? Claim: ${claim}`);
  });
  questions.unsupported = noul(
    "Does the answer make any factual claim that the cited transcript does not support?",
  );
  return {
    model,
    state: {
      question: input.question,
      answer: input.answer,
      citedTranscript: input.citedCues.map((cue) => ({
        lecture: cue.lectureId,
        cue: cue.cueId,
        startSec: cue.startMs / 1000,
        endSec: cue.endMs / 1000,
        text: cue.text.trim(),
      })),
    },
    questions,
  };
}

/** Reads a systemone response; malformed output throws, so the runner records a judge failure. */
export function parseJevVerdict(input: JudgeInput, rawOutput: string): JudgeVerdict {
  let body: unknown;
  try {
    body = JSON.parse(rawOutput);
  } catch {
    throw new Error("Jev output is not JSON.");
  }
  const answers = (body as { answers?: Record<string, { noul?: unknown }> } | null)?.answers;
  const decide = (name: string): { yes: boolean; confidence: number } => {
    const probability = answers?.[name]?.noul;
    if (typeof probability !== "number" || !(probability >= 0 && probability <= 1))
      throw new Error(`Jev output has no yes/no probability for "${name}".`);
    const yes = probability >= 0.5;
    return { yes, confidence: yes ? probability : 1 - probability };
  };
  const requiredPoints = input.requiredPoints.map((point, index) => {
    const { yes, confidence } = decide(`point_${index}`);
    return { point, supported: yes, confidence };
  });
  const disallowedClaims = input.disallowedClaims.map((claim, index) => {
    const { yes, confidence } = decide(`disallowed_${index}`);
    return { claim, present: yes, confidence };
  });
  const unsupported = decide("unsupported");
  return {
    requiredPoints,
    disallowedClaims,
    unsupportedClaims: { present: unsupported.yes, confidence: unsupported.confidence },
    rawOutput,
  };
}

export interface JevJudgeOptions {
  apiKey: string;
  /** API root; the browser goes through a dev-server proxy because the API rejects page origins. */
  baseUrl?: string;
  model?: string;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

/** Judges coverage with Jev through TypeSafe AI's systemone API. */
export function createJevJudge(options: JevJudgeOptions): JudgeAdapter {
  const model = options.model ?? JEV_DEFAULT_MODEL;
  const baseUrl = (options.baseUrl ?? "https://api.typesafe.ai").replace(/\/+$/, "");
  const fetcher = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  return {
    identity: { judge: "jev", model, promptVersion: JEV_PROMPT_VERSION },
    async judge(input, signal) {
      const response = await fetcher(`${baseUrl}/v1/systemone`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildJevRequest(input, model)),
        signal,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Jev returned ${response.status}: ${text}`);
      return parseJevVerdict(input, text);
    },
  };
}
