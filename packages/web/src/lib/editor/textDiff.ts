// Line-level change hunks between a document and a proposed version, with word-level segments for
// showing each hunk. Used to review chat edits before they are written to the note.

export interface DiffHunk {
  baseFrom: number;
  baseTo: number;
  proposedFrom: number;
  proposedTo: number;
}

export type DiffSegmentType = "delete" | "equal" | "insert";

export interface DiffSegment {
  text: string;
  type: DiffSegmentType;
}

// Above this many LCS cells the changed middle is treated as one hunk instead of being aligned.
const MAX_LCS_CELLS = 4_000_000;
const MAX_WORD_LCS_CELLS = 250_000;

const splitLines = (text: string): string[] => {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
};

type TokenRun = { baseFrom: number; baseTo: number; proposedFrom: number; proposedTo: number };

// Aligns two token lists and returns the index ranges that differ.
const diffTokenRanges = (
  base: readonly string[],
  proposed: readonly string[],
  maxCells: number,
): TokenRun[] => {
  let prefix = 0;
  while (prefix < base.length && prefix < proposed.length && base[prefix] === proposed[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < base.length - prefix &&
    suffix < proposed.length - prefix &&
    base[base.length - 1 - suffix] === proposed[proposed.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const baseMiddle = base.slice(prefix, base.length - suffix);
  const proposedMiddle = proposed.slice(prefix, proposed.length - suffix);
  if (baseMiddle.length === 0 && proposedMiddle.length === 0) {
    return [];
  }

  const rows = baseMiddle.length;
  const columns = proposedMiddle.length;
  if (rows === 0 || columns === 0 || (rows + 1) * (columns + 1) > maxCells) {
    return [
      {
        baseFrom: prefix,
        baseTo: prefix + rows,
        proposedFrom: prefix,
        proposedTo: prefix + columns,
      },
    ];
  }

  // lengths[i][j]: LCS length of baseMiddle[i..] and proposedMiddle[j..].
  const width = columns + 1;
  const lengths = new Uint32Array((rows + 1) * width);
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = columns - 1; j >= 0; j -= 1) {
      lengths[i * width + j] =
        baseMiddle[i] === proposedMiddle[j]
          ? lengths[(i + 1) * width + j + 1] + 1
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }

  const runs: TokenRun[] = [];
  let current: TokenRun | null = null;
  let i = 0;
  let j = 0;
  const extend = (baseStep: number, proposedStep: number): void => {
    current ??= {
      baseFrom: prefix + i,
      baseTo: prefix + i,
      proposedFrom: prefix + j,
      proposedTo: prefix + j,
    };
    current.baseTo += baseStep;
    current.proposedTo += proposedStep;
  };

  while (i < rows || j < columns) {
    if (i < rows && j < columns && baseMiddle[i] === proposedMiddle[j]) {
      if (current) {
        runs.push(current);
        current = null;
      }
      i += 1;
      j += 1;
    } else if (
      j >= columns ||
      (i < rows && lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])
    ) {
      extend(1, 0);
      i += 1;
    } else {
      extend(0, 1);
      j += 1;
    }
  }
  if (current) {
    runs.push(current);
  }

  return runs;
};

const toOffsets = (tokens: readonly string[]): number[] => {
  const offsets = [0];
  for (const token of tokens) {
    offsets.push((offsets.at(-1) ?? 0) + token.length);
  }
  return offsets;
};

export const computeDiffHunks = (base: string, proposed: string): DiffHunk[] => {
  if (base === proposed) {
    return [];
  }

  const baseLines = splitLines(base);
  const proposedLines = splitLines(proposed);
  const baseOffsets = toOffsets(baseLines);
  const proposedOffsets = toOffsets(proposedLines);

  return diffTokenRanges(baseLines, proposedLines, MAX_LCS_CELLS).map((run) => ({
    baseFrom: baseOffsets[run.baseFrom] ?? 0,
    baseTo: baseOffsets[run.baseTo] ?? base.length,
    proposedFrom: proposedOffsets[run.proposedFrom] ?? 0,
    proposedTo: proposedOffsets[run.proposedTo] ?? proposed.length,
  }));
};

// Writes one proposed hunk into the document.
export const acceptDiffHunk = (base: string, proposed: string, hunk: DiffHunk): string => {
  return `${base.slice(0, hunk.baseFrom)}${proposed.slice(hunk.proposedFrom, hunk.proposedTo)}${base.slice(hunk.baseTo)}`;
};

// Drops one hunk from the proposal, restoring the document's text there.
export const rejectDiffHunk = (base: string, proposed: string, hunk: DiffHunk): string => {
  return `${proposed.slice(0, hunk.proposedFrom)}${base.slice(hunk.baseFrom, hunk.baseTo)}${proposed.slice(hunk.proposedTo)}`;
};

// Latin, Greek, and Cyrillic words, whitespace runs, and single other characters, so CJK text
// diffs per character.
const WORD_TOKEN_REGEXP = /[A-Za-z0-9_\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]+|\s+|[\s\S]/gu;

const tokenizeWords = (text: string): string[] => {
  return text.match(WORD_TOKEN_REGEXP) ?? [];
};

const pushSegment = (segments: DiffSegment[], type: DiffSegmentType, text: string): void => {
  if (!text) {
    return;
  }
  const last = segments.at(-1);
  if (last?.type === type) {
    last.text += text;
  } else {
    segments.push({ text, type });
  }
};

export const computeWordSegments = (base: string, proposed: string): DiffSegment[] => {
  const baseTokens = tokenizeWords(base);
  const proposedTokens = tokenizeWords(proposed);
  const runs = diffTokenRanges(baseTokens, proposedTokens, MAX_WORD_LCS_CELLS);
  const segments: DiffSegment[] = [];
  let baseIndex = 0;
  for (const run of runs) {
    pushSegment(segments, "equal", baseTokens.slice(baseIndex, run.baseFrom).join(""));
    pushSegment(segments, "delete", baseTokens.slice(run.baseFrom, run.baseTo).join(""));
    pushSegment(
      segments,
      "insert",
      proposedTokens.slice(run.proposedFrom, run.proposedTo).join(""),
    );
    baseIndex = run.baseTo;
  }
  pushSegment(segments, "equal", baseTokens.slice(baseIndex).join(""));
  return segments;
};
