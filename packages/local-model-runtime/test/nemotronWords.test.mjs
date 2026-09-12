import assert from "node:assert/strict";
import test from "node:test";

import { tokensToTimestampedWords } from "../dist/index.js";

test("splits adjacent words normally when each token carries its own leading marker", () => {
  const words = tokensToTimestampedWords(
    [
      { text: " out", seconds: 0 },
      { text: "bound", seconds: 0.1 },
      { text: " market", seconds: 0.3 },
    ],
    1,
  );

  assert.deepEqual(
    words.map((word) => word.text),
    ["outbound", "market"],
  );
});

test("still splits words when a word boundary arrives as its own whitespace-only token", () => {
  // A "▁" vocab entry decoded on its own (before tokenToText's `▁` -> " " swap becomes
  // just " ") used to be silently dropped, fusing the next subword onto the previous
  // word ("outboundmarket" instead of "outbound market").
  const words = tokensToTimestampedWords(
    [
      { text: " out", seconds: 0 },
      { text: "bound", seconds: 0.1 },
      { text: " ", seconds: 0.2 },
      { text: "market", seconds: 0.3 },
    ],
    1,
  );

  assert.deepEqual(
    words.map((word) => word.text),
    ["outbound", "market"],
  );
  assert.equal(words[1].timestamp[0], 0.3);
});
