import { describe, expect, it } from "vitest";

import { DEFAULT_NORMALIZATION_PROFILE, decodeWav, scoreText } from "../src/index";

describe("scoreText", () => {
  it("normalizes text and reports independently checkable WER and CER edits", () => {
    const score = scoreText(" café  noir ", "cafe noir!");

    expect(DEFAULT_NORMALIZATION_PROFILE).toEqual({
      id: "memora-text-default",
      version: 1,
      unicode: "NFC",
      whitespace: "trim-and-collapse",
      caseSensitive: false,
      punctuation: "strip",
    });
    expect(score.reference.normalized).toBe("café noir");
    expect(score.prediction.normalized).toBe("cafe noir");
    expect(score.wer).toMatchObject({ edits: 1, referenceUnits: 2 });
    expect(score.cer).toMatchObject({ edits: 1, referenceUnits: 8 });
  });

  it("does not score case or punctuation differences as errors", () => {
    // FLEURS references are lowercase with no punctuation; Whisper output is naturally
    // cased and punctuated. A transcription that is word-for-word correct must not be
    // penalized just because casing/punctuation don't match the reference's convention.
    const score = scoreText(
      "the major religion in moldova is orthodox christian",
      " The major religion in Moldova is Orthodox Christian.",
    );

    expect(score.wer).toMatchObject({ value: 0, edits: 0 });
    expect(score.cer).toMatchObject({ value: 0, edits: 0 });
  });

  it("returns a reason instead of dividing by a zero reference", () => {
    const score = scoreText("   ", "hello");

    expect(score.wer).toMatchObject({ value: null, reason: "zero-reference-units" });
    expect(score.cer).toMatchObject({ value: null, reason: "zero-reference-units" });
  });
});

describe("decodeWav", () => {
  it("rejects unsupported channels before inference", () => {
    const bytes = new Uint8Array(46);
    const view = new DataView(bytes.buffer);
    for (const [offset, value] of [
      [0, "RIFF"],
      [8, "WAVE"],
      [12, "fmt "],
      [36, "data"],
    ] as const) {
      Array.from(value).forEach((character, index) =>
        view.setUint8(offset + index, character.charCodeAt(0)),
      );
    }
    view.setUint32(4, 38, true);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, 16_000, true);
    view.setUint16(34, 16, true);
    view.setUint32(40, 2, true);

    expect(() => decodeWav(bytes)).toThrow("WAV must be mono");
  });
});
