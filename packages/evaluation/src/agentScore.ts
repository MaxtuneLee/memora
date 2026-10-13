import type {
  AgentCitation,
  CitationScore,
  EvaluationQuestion,
  EvidenceWindow,
} from "./agentTypes";

/** Bump when the scoring rules change, so older results stay distinguishable. */
export const AGENT_SCORER_VERSION = 1;
/** Cue granularity (about 2.7 s) plus whole-second rounding in jump tags. */
export const CITATION_TOLERANCE_SEC = 5;

export const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Gap in seconds between a citation and a window; 0 when they overlap. */
const distanceSec = (citation: AgentCitation, window: EvidenceWindow): number =>
  Math.max(0, window.startMs / 1000 - citation.endSec, citation.startSec - window.endMs / 1000);

/** Per citation, whether it lands within tolerance of any evidence window of the question. */
export function citationHits(
  question: Pick<EvaluationQuestion, "evidence">,
  citations: AgentCitation[],
  fileLectures: Record<string, string>,
): boolean[] {
  return citations.map((citation) =>
    question.evidence.some((windows) =>
      windows.some(
        (window) =>
          fileLectures[citation.fileId] === window.lectureId &&
          distanceSec(citation, window) <= CITATION_TOLERANCE_SEC,
      ),
    ),
  );
}

/**
 * Deterministic citation scoring: pure, and versioned by `AGENT_SCORER_VERSION`.
 * `fileLectures` maps each imported file ID to its lecture ID.
 */
export function scoreCitations(
  question: EvaluationQuestion,
  citations: AgentCitation[],
  fileLectures: Record<string, string>,
): CitationScore {
  const closest = (window: EvidenceWindow): number | null => {
    const distances = citations
      .filter((citation) => fileLectures[citation.fileId] === window.lectureId)
      .map((citation) => distanceSec(citation, window));
    return distances.length === 0 ? null : Math.min(...distances);
  };
  const groups = question.evidence.map((windows) => {
    const distances = windows.map(closest).filter((value) => value !== null);
    const distance = distances.length === 0 ? null : Math.min(...distances);
    return { hit: distance !== null && distance <= CITATION_TOLERANCE_SEC, distanceSec: distance };
  });
  const measured = groups.flatMap((group) =>
    group.distanceSec === null ? [] : [group.distanceSec],
  );
  const hits = citationHits(question, citations, fileLectures).filter(Boolean).length;
  return {
    scorerVersion: AGENT_SCORER_VERSION,
    retrieval: { passed: groups.every((group) => group.hit), groups },
    timestamp: {
      medianDistanceSec: median(measured),
      withinToleranceShare:
        measured.length === 0
          ? null
          : measured.filter((value) => value <= CITATION_TOLERANCE_SEC).length / measured.length,
      uncitedGroups: groups.length - measured.length,
    },
    citationPrecision: citations.length === 0 ? null : hits / citations.length,
  };
}
