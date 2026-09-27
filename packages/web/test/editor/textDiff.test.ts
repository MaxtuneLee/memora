import { expect, test } from "vite-plus/test";

import {
  acceptDiffHunk,
  computeDiffHunks,
  computeWordSegments,
  rejectDiffHunk,
} from "@/lib/editor/textDiff";

const base = "# Title\n\nalpha\nbeta\ngamma\n\n- one\n- two\n";
const proposed = "# New title\n\nalpha\nbeta\ngamma\n\n- one\n- two\n- three\n";

test("finds separate line hunks", () => {
  const hunks = computeDiffHunks(base, proposed);
  expect(hunks).toHaveLength(2);
  expect(base.slice(hunks[0]!.baseFrom, hunks[0]!.baseTo)).toBe("# Title\n");
  expect(proposed.slice(hunks[0]!.proposedFrom, hunks[0]!.proposedTo)).toBe("# New title\n");
  expect(base.slice(hunks[1]!.baseFrom, hunks[1]!.baseTo)).toBe("");
  expect(proposed.slice(hunks[1]!.proposedFrom, hunks[1]!.proposedTo)).toBe("- three\n");
});

test("accepting and rejecting one hunk leaves the other pending", () => {
  const [first, second] = computeDiffHunks(base, proposed);
  const accepted = acceptDiffHunk(base, proposed, first!);
  expect(accepted).toBe("# New title\n\nalpha\nbeta\ngamma\n\n- one\n- two\n");
  expect(computeDiffHunks(accepted, proposed)).toHaveLength(1);

  const rejected = rejectDiffHunk(base, proposed, second!);
  expect(rejected).toBe("# New title\n\nalpha\nbeta\ngamma\n\n- one\n- two\n");
  expect(computeDiffHunks(base, rejected)).toHaveLength(1);
});

test("accepting every hunk gives the proposal", () => {
  let current = base;
  for (let hunks = computeDiffHunks(current, proposed); hunks.length;) {
    current = acceptDiffHunk(current, proposed, hunks[0]!);
    hunks = computeDiffHunks(current, proposed);
  }
  expect(current).toBe(proposed);
});

test("handles a missing final newline and empty documents", () => {
  expect(computeDiffHunks("a", "a\n")).toHaveLength(1);
  const [hunk] = computeDiffHunks("", "# Hi");
  expect(acceptDiffHunk("", "# Hi", hunk!)).toBe("# Hi");
});

test("splits word changes and CJK characters", () => {
  expect(computeWordSegments("Hello world\n", "Hello brave world\n")).toEqual([
    { text: "Hello ", type: "equal" },
    { text: "brave ", type: "insert" },
    { text: "world\n", type: "equal" },
  ]);
  expect(computeWordSegments("你好世界", "你好中国")).toEqual([
    { text: "你好", type: "equal" },
    { text: "世界", type: "delete" },
    { text: "中国", type: "insert" },
  ]);
});
