import {
  agentEvaluationTotals,
  attemptFailureReasons,
  attemptStatus,
  citationHits,
  groupAttemptsByQuestion,
  spotChecks,
  type AgentAttemptResult,
  type AgentEvaluationResult,
  type AttemptStatus,
  type EvaluationQuestion,
} from "@memora/evaluation";
import * as stylex from "@stylexjs/stylex";
import { lazy, Suspense, useState } from "react";

import { Button } from "@/components/ui/Button";
import { NativeDialog } from "@/components/ui/NativeDialog";
import { TabSelect } from "@/components/ui/TabSelect";
import { parseMemoraJumpContent } from "@/lib/chat/memoraJump";
import { tokens } from "../../styles/stylex.stylex";

// Development builds only, like the chat Trace tab; Traces are recorded only there.
const ChatPageTracePanel = import.meta.env.DEV
  ? lazy(() =>
      import("../chat/chatPage/ChatPageTracePanel").then((module) => ({
        default: module.ChatPageTracePanel,
      })),
    )
  : null;

const styles = stylex.create({
  grid: {
    display: "grid",
    gap: "0.75rem",
    gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
  },
  card: {
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.border,
    borderRadius: "1rem",
    borderStyle: "solid",
    borderWidth: 1,
    padding: "0.875rem 1rem",
  },
  cardLabel: { color: tokens.textSoft, fontSize: "0.75rem", lineHeight: "1rem" },
  cardValue: {
    color: tokens.textStrong,
    fontSize: "1rem",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    lineHeight: "1.5rem",
    marginTop: "0.25rem",
  },
  cardNote: { color: tokens.textMuted, fontSize: "0.75rem", lineHeight: "1rem" },
  toolbar: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.75rem" },
  check: {
    alignItems: "center",
    color: tokens.text,
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.375rem",
  },
  list: { display: "flex", flexDirection: "column" },
  question: {
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBlock: "0.5rem",
  },
  questionSummary: {
    alignItems: "center",
    cursor: "pointer",
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.75rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.25rem",
  },
  questionId: { color: tokens.textMuted, flexShrink: 0, fontVariantNumeric: "tabular-nums" },
  questionText: {
    color: tokens.text,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  passes: { color: tokens.textMuted, flexShrink: 0, fontVariantNumeric: "tabular-nums" },
  markers: { display: "flex", flexShrink: 0, gap: "0.25rem" },
  marker: { borderRadius: 9999, height: "0.625rem", width: "0.625rem" },
  passed: { backgroundColor: tokens.successText },
  uncertain: { backgroundColor: tokens.infoText },
  failed: { backgroundColor: tokens.dangerText },
  error: { backgroundColor: tokens.warningText },
  pending: {
    borderColor: tokens.borderStrong,
    borderStyle: "dashed",
    borderWidth: 1,
  },
  attempts: { display: "flex", flexDirection: "column", gap: "0.75rem", paddingBlock: "0.5rem" },
  attempt: {
    backgroundColor: tokens.surfaceSoft,
    borderColor: tokens.border,
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.625rem",
    padding: "0.875rem 1rem",
  },
  attemptHead: {
    alignItems: "center",
    color: tokens.textStrong,
    display: "flex",
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
  },
  meta: { color: tokens.textMuted, fontSize: "0.75rem", lineHeight: "1rem" },
  reasons: {
    color: tokens.dangerText,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    listStyleType: "disc",
    paddingInlineStart: "1.25rem",
  },
  heading: { color: tokens.textMuted, fontSize: "0.75rem", fontWeight: 500 },
  answer: {
    color: tokens.text,
    fontSize: "0.875rem",
    lineHeight: "1.5rem",
    whiteSpace: "pre-wrap",
  },
  citation: {
    borderRadius: "0.375rem",
    borderStyle: "solid",
    borderWidth: 1,
    fontSize: "0.75rem",
    marginInline: "0.125rem",
    paddingInline: "0.375rem",
    whiteSpace: "nowrap",
  },
  hit: {
    backgroundColor: tokens.successSurface,
    borderColor: tokens.successBorder,
    color: tokens.successText,
  },
  miss: {
    backgroundColor: tokens.dangerSurface,
    borderColor: tokens.dangerBorder,
    color: tokens.dangerText,
  },
  unscored: { borderColor: tokens.border, color: tokens.textMuted },
  decisions: { display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.875rem" },
  decision: { color: tokens.text, lineHeight: "1.25rem" },
  confidence: { color: tokens.textSoft, fontVariantNumeric: "tabular-nums" },
  dialog: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: 16,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    height: "min(860px, 90vh)",
    overflow: "hidden",
    width: "min(1200px, 96vw)",
  },
  dialogHead: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    paddingBlock: 12,
    paddingInline: 16,
  },
  dialogTitle: { color: tokens.textStrong, fontSize: "0.875rem", fontWeight: 600 },
});

const percent = (value: number | null) => (value === null ? "None" : `${Math.round(value * 100)}%`);
const count = (value: number) => value.toLocaleString();
const clock = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const duration = (ms: number) => {
  const sec = Math.round(ms / 1000);
  return sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)} min ${sec % 60} s`;
};

const STATUS_LABELS: Record<AttemptStatus, string> = {
  passed: "Passed",
  uncertain: "Uncertain",
  failed: "Failed",
  error: "Error",
};

export function AgentEvaluationSummaryView({ result }: { result: AgentEvaluationResult }) {
  const { summary } = result;
  const totals = agentEvaluationTotals(result);
  const completed = summary.completedAttempts;
  const { failures } = summary;
  const judgeUsage = Object.entries(totals.judgeUsage);
  const cards: Array<[string, string, string?]> = [
    ["Pass rate", `${summary.passed} / ${completed} · ${percent(totals.passRate)}`],
    [
      "Uncertain",
      summary.uncertain === undefined
        ? "Not counted"
        : `${summary.uncertain} / ${completed} · ${percent(totals.uncertainRate)}`,
      "Jev was too close to call on a required point or disallowed claim",
    ],
    [
      "Retrieval passed",
      `${summary.retrievalPassed} / ${completed} · ${percent(totals.retrievalRate)}`,
    ],
    [
      "Coverage passed",
      `${summary.coveragePassed} / ${completed} · ${percent(totals.coverageRate)}`,
    ],
    [
      "Failures",
      String(failures.error + failures.timeout + failures["judge-error"]),
      `${failures.error} agent errors, ${failures.timeout} timeouts, ${failures["judge-error"]} judge errors`,
    ],
    [
      "Median timestamp distance",
      summary.medianDistanceSec === null ? "None" : `${summary.medianDistanceSec.toFixed(1)} s`,
    ],
    ["Citation precision", percent(totals.citationPrecision)],
    [
      "Agent tokens",
      `${count(totals.agentTokens.input)} in · ${count(totals.agentTokens.cached)} cached · ${count(totals.agentTokens.output)} out`,
      totals.agentTokens.unknownAttempts
        ? `${totals.agentTokens.unknownAttempts} attempts without a Trace are not counted`
        : undefined,
    ],
    [
      "Jev usage",
      judgeUsage.length
        ? judgeUsage
            .map(([key, value]) => `${key.replaceAll("_", " ")} ${count(value)}`)
            .join(" · ")
        : "Not reported",
    ],
    [
      "Duration",
      duration(totals.durationMs),
      completed < summary.plannedAttempts
        ? `${completed} of ${summary.plannedAttempts} attempts ran`
        : undefined,
    ],
  ];
  return (
    <div {...stylex.props(styles.grid)}>
      {cards.map(([label, value, note]) => (
        <div key={label} {...stylex.props(styles.card)}>
          <p {...stylex.props(styles.cardLabel)}>{label}</p>
          <p {...stylex.props(styles.cardValue)}>{value}</p>
          {note ? <p {...stylex.props(styles.cardNote)}>{note}</p> : null}
        </div>
      ))}
    </div>
  );
}

type Order = "questions" | "review";
const ORDER_OPTIONS = [
  { value: "questions", label: "Question order" },
  { value: "review", label: "Review these first" },
] as const;

type QuestionInfo = Pick<EvaluationQuestion, "questionId"> & Partial<EvaluationQuestion>;

/** Per-question attempts; attempts still running show as empty markers. */
export function AgentAttemptList({
  questions,
  attempts,
  attemptsPerQuestion,
  fileLectures,
}: {
  /** In question order; only IDs for results saved before questions were stored. */
  questions: QuestionInfo[];
  attempts: AgentAttemptResult[];
  attemptsPerQuestion: number;
  fileLectures?: Record<string, string>;
}) {
  const [failedOnly, setFailedOnly] = useState(false);
  const [order, setOrder] = useState<Order>("questions");
  const [trace, setTrace] = useState<{ sessionId: string; runId: string } | null>(null);
  const byId = new Map(questions.map((question) => [question.questionId, question]));
  let groups = groupAttemptsByQuestion(
    questions.map((question) => question.questionId),
    attempts,
  );
  if (failedOnly)
    groups = groups.filter((group) => group.attempts.some((attempt) => !attempt.passed));
  if (order === "review") {
    const rank = new Map<string, number>();
    spotChecks({ attempts }).forEach((check, index) => {
      if (!rank.has(check.questionId)) rank.set(check.questionId, index);
    });
    groups = groups
      .filter((group) => rank.has(group.questionId))
      .sort((a, b) => (rank.get(a.questionId) ?? 0) - (rank.get(b.questionId) ?? 0));
  }

  return (
    <>
      <div {...stylex.props(styles.toolbar)}>
        <TabSelect
          aria-label="Question order"
          value={order}
          onValueChange={setOrder}
          options={ORDER_OPTIONS}
        />
        <label {...stylex.props(styles.check)}>
          <input
            type="checkbox"
            checked={failedOnly}
            onChange={(event) => setFailedOnly(event.target.checked)}
          />
          Failed only
        </label>
      </div>
      <div {...stylex.props(styles.list)}>
        {groups.map((group) => {
          const question = byId.get(group.questionId);
          return (
            <details key={group.questionId} {...stylex.props(styles.question)}>
              <summary {...stylex.props(styles.questionSummary)}>
                <span {...stylex.props(styles.questionId)}>{group.questionId}</span>
                <span {...stylex.props(styles.questionText)}>{question?.question}</span>
                <span {...stylex.props(styles.markers)}>
                  {Array.from({ length: attemptsPerQuestion }, (_, index) => {
                    const attempt = group.attempts.find((item) => item.attempt === index + 1);
                    const status = attempt ? attemptStatus(attempt) : null;
                    return (
                      <span
                        key={index}
                        title={`Attempt ${index + 1}: ${status ? STATUS_LABELS[status] : "Not finished"}`}
                        {...stylex.props(styles.marker, status ? styles[status] : styles.pending)}
                      />
                    );
                  })}
                </span>
                <span {...stylex.props(styles.passes)}>
                  {group.passes} / {attemptsPerQuestion} passed
                </span>
              </summary>
              <div {...stylex.props(styles.attempts)}>
                {question?.question ? (
                  <p {...stylex.props(styles.answer)}>{question.question}</p>
                ) : null}
                {group.attempts.map((attempt) => (
                  <AttemptDetail
                    key={attempt.attempt}
                    attempt={attempt}
                    question={question}
                    fileLectures={fileLectures}
                    onOpenTrace={ChatPageTracePanel ? setTrace : undefined}
                  />
                ))}
              </div>
            </details>
          );
        })}
      </div>
      {ChatPageTracePanel ? (
        <NativeDialog
          open={trace !== null}
          onOpenChange={(open) => {
            if (!open) setTrace(null);
          }}
          panelClassName={stylex.props(styles.dialog).className}
        >
          <div {...stylex.props(styles.dialogHead)}>
            <h2 {...stylex.props(styles.dialogTitle)}>Trace</h2>
            <Button onClick={() => setTrace(null)}>Close</Button>
          </div>
          {trace ? (
            <Suspense fallback={null}>
              <ChatPageTracePanel sessionId={trace.sessionId} runId={trace.runId} />
            </Suspense>
          ) : null}
        </NativeDialog>
      ) : null}
    </>
  );
}

function AttemptDetail({
  attempt,
  question,
  fileLectures,
  onOpenTrace,
}: {
  attempt: AgentAttemptResult;
  question?: QuestionInfo;
  fileLectures?: Record<string, string>;
  onOpenTrace?: (trace: { sessionId: string; runId: string }) => void;
}) {
  const status = attemptStatus(attempt);
  const reasons = attemptFailureReasons(attempt);
  const { answer, coverage } = attempt;
  const evidence = question?.evidence;
  const hits =
    answer && evidence && fileLectures
      ? citationHits({ evidence }, answer.citations, fileLectures)
      : undefined;
  const parts = answer ? parseMemoraJumpContent(answer.answer) : [];
  // Jump parts come in citation order, so the nth jump is the nth citation.
  let jumps = 0;
  const citationIndex = parts.map((part) => (part.type === "jump" ? jumps++ : -1));
  // Failed attempts without an answer may still carry their Trace.
  const trace = answer ?? attempt.trace;
  const runId = trace?.runId;
  return (
    <article {...stylex.props(styles.attempt)}>
      <div {...stylex.props(styles.attemptHead)}>
        <span {...stylex.props(styles.marker, styles[status])} />
        Attempt {attempt.attempt} · {STATUS_LABELS[status]}
      </div>
      <p {...stylex.props(styles.meta)}>
        {duration(attempt.latencyMs)}
        {trace
          ? ` · ${
              trace.tokens
                ? `${count(trace.tokens.input)} in · ${trace.tokens.cached === undefined ? "" : `${count(trace.tokens.cached)} cached · `}${count(trace.tokens.output)} out tokens`
                : "Tokens unknown"
            } · Fallback trims ${trace.fallbackTrims === "unknown" ? "unknown" : trace.fallbackTrims}`
          : null}
      </p>
      {reasons.length ? (
        <ul {...stylex.props(styles.reasons)}>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {answer ? (
        <div>
          <p {...stylex.props(styles.heading)}>Answer</p>
          <p {...stylex.props(styles.answer)}>
            {parts.map((part, index) => {
              if (part.type === "text") return <span key={index}>{part.content}</span>;
              const hit = hits?.[citationIndex[index]];
              const { fileName, startSec, endSec } = part.jumpCard;
              return (
                <span
                  key={index}
                  title={
                    hit === undefined
                      ? undefined
                      : hit
                        ? "Hits the evidence"
                        : "Misses the evidence"
                  }
                  {...stylex.props(
                    styles.citation,
                    hit === undefined ? styles.unscored : hit ? styles.hit : styles.miss,
                  )}
                >
                  {fileName} {clock(startSec)}–{clock(endSec)}
                  {hit === undefined ? "" : hit ? " · hit" : " · miss"}
                </span>
              );
            })}
          </p>
        </div>
      ) : null}
      {coverage ? (
        <div {...stylex.props(styles.decisions)}>
          <p {...stylex.props(styles.heading)}>Jev decisions</p>
          {coverage.verdict.requiredPoints.map((decision) => (
            <p key={`point-${decision.point}`} {...stylex.props(styles.decision)}>
              {decision.supported ? "Supported" : "Not supported"}: {decision.point}{" "}
              <span {...stylex.props(styles.confidence)}>{decision.confidence.toFixed(2)}</span>
            </p>
          ))}
          {coverage.verdict.disallowedClaims.map((decision) => (
            <p key={`claim-${decision.claim}`} {...stylex.props(styles.decision)}>
              {decision.present ? "Made" : "Not made"}: {decision.claim}{" "}
              <span {...stylex.props(styles.confidence)}>{decision.confidence.toFixed(2)}</span>
            </p>
          ))}
          <p {...stylex.props(styles.decision)}>
            {coverage.verdict.unsupportedClaims.present
              ? "Makes unsupported claims (reported only)"
              : "No unsupported claims"}{" "}
            <span {...stylex.props(styles.confidence)}>
              {coverage.verdict.unsupportedClaims.confidence.toFixed(2)}
            </span>
          </p>
        </div>
      ) : null}
      {trace && runId && onOpenTrace ? (
        <Button onClick={() => onOpenTrace({ sessionId: trace.sessionId, runId })}>
          Open trace
        </Button>
      ) : null}
    </article>
  );
}
