import assert from "node:assert/strict";
import test from "node:test";

import { inverseNormalizeEnglishText, inverseNormalizeNemotronTranscript } from "../dist/index.js";

test("converts Nemotron spoken-form numbers when an utterance closes", () => {
  assert.equal(inverseNormalizeEnglishText("fourteen hundred"), "1,400");
  assert.equal(
    inverseNormalizeEnglishText("we moved here in twenty ten."),
    "we moved here in 2010.",
  );
  assert.equal(
    inverseNormalizeEnglishText("four thousand eight hundred and ninety two meters"),
    "4,892 m",
  );
});

test("supports decimals, negatives, hyphenated numbers, and existing written numbers", () => {
  assert.equal(inverseNormalizeEnglishText("negative four point five meters"), "-4.5 m");
  assert.equal(inverseNormalizeEnglishText("twenty-one kilometers"), "21 km");
  assert.equal(
    inverseNormalizeEnglishText("the result is 1,400 meters"),
    "the result is 1,400 meters",
  );
});

test("keeps unrelated text unchanged", () => {
  assert.equal(inverseNormalizeEnglishText("we met at the station"), "we met at the station");
  assert.equal(inverseNormalizeEnglishText("ten twenty"), "10 20");
});

test("keeps final text and timestamped words aligned", () => {
  const result = inverseNormalizeNemotronTranscript(
    "four thousand eight hundred and ninety two meters.",
    [
      { text: "four", timestamp: [0, 0.2] },
      { text: "thousand", timestamp: [0.2, 0.5] },
      { text: "eight", timestamp: [0.5, 0.7] },
      { text: "hundred", timestamp: [0.7, 0.9] },
      { text: "and", timestamp: [0.9, 1] },
      { text: "ninety", timestamp: [1, 1.2] },
      { text: "two", timestamp: [1.2, 1.4] },
      { text: "meters.", timestamp: [1.4, 1.8] },
    ],
  );

  assert.equal(result.text, "4,892 m.");
  assert.deepEqual(result.words, [
    { text: "4,892", timestamp: [0, 1.4] },
    { text: "m.", timestamp: [1.4, 1.8] },
  ]);
});
