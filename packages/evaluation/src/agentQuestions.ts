import * as v from "valibot";

import type { EvaluationQuestion } from "./agentTypes";
import { EvaluationError } from "./errors";

const nonEmpty = v.pipe(v.string(), v.minLength(1));
const milliseconds = v.pipe(v.number(), v.integer(), v.minValue(0));

const EvidenceWindowSchema = v.pipe(
  v.object({
    lectureId: nonEmpty,
    startCueId: nonEmpty,
    endCueId: nonEmpty,
    startMs: milliseconds,
    endMs: milliseconds,
  }),
  v.check((window) => window.endMs >= window.startMs, "endMs must not be before startMs"),
);

export const EvaluationQuestionSchema: v.GenericSchema<unknown, EvaluationQuestion> = v.pipe(
  v.object({
    questionId: nonEmpty,
    question: nonEmpty,
    lectureIds: v.pipe(v.array(nonEmpty), v.minLength(1)),
    // Required groups; windows inside a group are alternatives.
    evidence: v.pipe(
      v.array(v.pipe(v.array(EvidenceWindowSchema), v.minLength(1))),
      v.minLength(1),
    ),
    requiredPoints: v.pipe(v.array(nonEmpty), v.minLength(1)),
    disallowedClaims: v.optional(v.array(nonEmpty)),
    kind: v.picklist(["localized", "paraphrase", "shared-term", "two-segment"]),
    reviewerNote: v.optional(v.string()),
  }),
  v.check(
    (question) =>
      question.evidence.every((group) =>
        group.every((window) => question.lectureIds.includes(window.lectureId)),
      ),
    "evidence must only cite the question's lectureIds",
  ),
);

const EvaluationQuestionsFileSchema = v.pipe(
  v.object({ questions: v.pipe(v.array(EvaluationQuestionSchema), v.minLength(1)) }),
  v.check(
    ({ questions }) => new Set(questions.map((item) => item.questionId)).size === questions.length,
    "questionId values must be unique",
  ),
);

/** Validates a questions file (`{ questions: EvaluationQuestion[] }`) and returns its questions. */
export function parseEvaluationQuestions(data: unknown): EvaluationQuestion[] {
  const result = v.safeParse(EvaluationQuestionsFileSchema, data);
  if (result.success) return result.output.questions;
  const issues = result.issues.slice(0, 5).map((issue) => {
    const path = v.getDotPath(issue);
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  throw new EvaluationError("invalid-questions", `Invalid questions file. ${issues.join("; ")}`);
}
