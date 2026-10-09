import * as v from "valibot";

import { EvaluationError } from "./errors";

/** A rule a reply must follow, checked by code rather than a judge. */
export type TextCheck =
  | { type: "language"; language: "zh" | "en" }
  /** Latin words and CJK characters each count as one word. */
  | { type: "maxWords"; value: number }
  | {
      type: "pattern";
      pattern: string;
      /** Regular expression flags; default `i`. */
      flags?: string;
      /** Default `match`. */
      expect?: "match" | "noMatch";
      label?: string;
    };

export interface TextCheckResult {
  label: string;
  passed: boolean;
  detail: string;
}

const JUMP_TAGS = /<memora-jump\b[\s\S]*?\/>|```memora-jumps[\s\S]*?```/gi;
const HAN = /\p{Script=Han}/gu;
const LATIN_WORD = /[\p{Script=Latin}\d]+(?:['’-][\p{Script=Latin}\d]+)*/gu;
/** A `zh` reply may keep English terms; an `en` reply may quote a Chinese title. */
const ZH_MIN_SHARE = 0.6;
const EN_MAX_SHARE = 0.05;

/** The reply without its citation tags, which carry no prose. */
export const answerProse = (answer: string): string => answer.replace(JUMP_TAGS, " ");

const counts = (text: string) => {
  const han = text.match(HAN)?.length ?? 0;
  const latin = text.match(LATIN_WORD)?.length ?? 0;
  return { han, latin, share: han + latin === 0 ? 0 : han / (han + latin) };
};

export const textCheckLabel = (check: TextCheck): string => {
  if (check.type === "language") return `Language ${check.language}`;
  if (check.type === "maxWords") return `At most ${check.value} words`;
  return (
    check.label ?? `${check.expect === "noMatch" ? "Does not match" : "Matches"} /${check.pattern}/`
  );
};

export function runTextChecks(text: string, checks: TextCheck[]): TextCheckResult[] {
  return checks.map((check) => {
    const label = textCheckLabel(check);
    if (check.type === "language") {
      const { share } = counts(text);
      const passed = check.language === "zh" ? share >= ZH_MIN_SHARE : share <= EN_MAX_SHARE;
      return { label, passed, detail: `CJK share ${share.toFixed(2)}` };
    }
    if (check.type === "maxWords") {
      const { han, latin } = counts(text);
      return { label, passed: han + latin <= check.value, detail: `${han + latin} words` };
    }
    const found = new RegExp(check.pattern, check.flags ?? "i").exec(text);
    const passed = (check.expect ?? "match") === "match" ? found !== null : found === null;
    return { label, passed, detail: found ? `matched "${found[0].slice(0, 80)}"` : "no match" };
  });
}

const nonEmpty = v.pipe(v.string(), v.minLength(1));

export const TextCheckSchema: v.GenericSchema<unknown, TextCheck> = v.variant("type", [
  v.object({ type: v.literal("language"), language: v.picklist(["zh", "en"]) }),
  v.object({
    type: v.literal("maxWords"),
    value: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  v.pipe(
    v.object({
      type: v.literal("pattern"),
      pattern: nonEmpty,
      flags: v.optional(v.string()),
      expect: v.optional(v.picklist(["match", "noMatch"])),
      label: v.optional(nonEmpty),
    }),
    v.check((check) => {
      try {
        new RegExp(check.pattern, check.flags ?? "i");
        return true;
      } catch {
        return false;
      }
    }, "pattern must be a valid regular expression"),
  ),
]);

/** Stored notices the agent answers under, and the rules its replies must then follow. */
export interface MemoryProfile {
  profileId: string;
  notices: string[];
  checks: TextCheck[];
}

const MemoryProfilesFileSchema = v.pipe(
  v.object({
    profiles: v.pipe(
      v.array(
        v.object({
          profileId: nonEmpty,
          notices: v.pipe(v.array(nonEmpty), v.minLength(1)),
          checks: v.pipe(v.array(TextCheckSchema), v.minLength(1)),
        }),
      ),
      v.minLength(1),
    ),
  }),
  v.check(
    ({ profiles }) => new Set(profiles.map((item) => item.profileId)).size === profiles.length,
    "profileId values must be unique",
  ),
);

export const issuesMessage = (issues: v.BaseIssue<unknown>[]): string =>
  issues
    .slice(0, 5)
    .map((issue) => {
      const path = v.getDotPath(issue);
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");

/** Validates a profiles file (`{ profiles: MemoryProfile[] }`) and returns its profiles. */
export function parseMemoryProfiles(data: unknown): MemoryProfile[] {
  const result = v.safeParse(MemoryProfilesFileSchema, data);
  if (result.success) return result.output.profiles;
  throw new EvaluationError(
    "invalid-questions",
    `Invalid memory profiles file. ${issuesMessage(result.issues)}`,
  );
}
