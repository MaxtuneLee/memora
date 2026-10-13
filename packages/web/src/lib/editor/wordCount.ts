// CJK text has no spaces between words, so it is counted by character instead.
const CJK_CHARACTER_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export interface TextLength {
  count: number;
  unit: "characters" | "words";
}

// Mostly-CJK text reports characters, with each embedded latin word counted as one (like a 字数).
// Everything else reports words.
export const measureTextLength = (text: string): TextLength => {
  const cjkCount = text.match(CJK_CHARACTER_PATTERN)?.length ?? 0;
  const wordCount = text.replace(CJK_CHARACTER_PATTERN, " ").match(WORD_PATTERN)?.length ?? 0;
  return cjkCount > wordCount
    ? { count: cjkCount + wordCount, unit: "characters" }
    : { count: wordCount, unit: "words" };
};
