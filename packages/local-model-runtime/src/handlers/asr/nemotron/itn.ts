interface WordToken {
  text: string;
  start: number;
  end: number;
  sourceWordIndex?: number;
}

interface NumberMatch {
  endToken: number;
  text: string;
}

interface ReplacementPart {
  text: string;
  startToken: number;
  endToken: number;
}

interface Replacement {
  start: number;
  end: number;
  startToken: number;
  endToken: number;
  parts: ReplacementPart[];
}

export interface NemotronTimestampedWord {
  text: string;
  timestamp: [number, number];
}

export interface InverseNormalizedTranscript {
  text: string;
  words?: NemotronTimestampedWord[];
}

const SMALL_NUMBERS: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const LARGE_SCALES: Readonly<Record<string, number>> = {
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
  trillion: 1_000_000_000_000,
};

const DIGITS: Readonly<Record<string, string>> = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

const MEASUREMENT_UNITS: Readonly<Record<string, string>> = {
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  kilometer: "km",
  kilometers: "km",
  kilometre: "km",
  kilometres: "km",
  centimeter: "cm",
  centimeters: "cm",
  centimetre: "cm",
  centimetres: "cm",
  millimeter: "mm",
  millimeters: "mm",
  millimetre: "mm",
  millimetres: "mm",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  liter: "L",
  liters: "L",
  litre: "L",
  litres: "L",
};

const valueOf = (values: Readonly<Record<string, number>>, word: string): number | undefined =>
  values[word.toLowerCase()];

const tokensAreAdjacent = (text: string, previous: WordToken, next: WordToken): boolean =>
  /^[\s-]*$/u.test(text.slice(previous.end, next.start));

const tokenizeWords = (
  text: string,
  sourceRanges?: ReadonlyArray<{ start: number; end: number }>,
): WordToken[] => {
  const tokens: WordToken[] = [];
  const pattern = /[A-Za-z]+/gu;
  let sourceWordIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;
    while (sourceRanges && sourceWordIndex < sourceRanges.length - 1) {
      const range = sourceRanges[sourceWordIndex];
      if (start < range.end) break;
      sourceWordIndex += 1;
    }
    tokens.push({
      text: match[0].toLowerCase(),
      start,
      end,
      ...(sourceRanges ? { sourceWordIndex } : {}),
    });
  }
  return tokens;
};

const isCardinalWord = (word: string): boolean =>
  valueOf(SMALL_NUMBERS, word) !== undefined ||
  valueOf(TENS, word) !== undefined ||
  word === "hundred" ||
  valueOf(LARGE_SCALES, word) !== undefined;

const parseCardinal = (
  text: string,
  tokens: readonly WordToken[],
  startToken: number,
): { endToken: number; value: number } | null => {
  type CardinalPart = "small" | "tens" | "hundred" | "scale";
  let current = 0;
  let total = 0;
  let index = startToken;
  let sawNumber = false;
  let lastPart: CardinalPart | undefined;

  while (index < tokens.length) {
    const token = tokens[index];
    if (index > startToken && !tokensAreAdjacent(text, tokens[index - 1], token)) break;

    if (token.text === "and") {
      const next = tokens[index + 1];
      if (
        !sawNumber ||
        (current < 100 && total === 0) ||
        !next ||
        !tokensAreAdjacent(text, token, next) ||
        !isCardinalWord(next.text)
      )
        break;
      index += 1;
      continue;
    }

    const small = valueOf(SMALL_NUMBERS, token.text);
    if (small !== undefined) {
      if (lastPart === "small" || (lastPart === "tens" && (small === 0 || small >= 10))) break;
      current += small;
      sawNumber = true;
      lastPart = "small";
      index += 1;
      continue;
    }

    const tens = valueOf(TENS, token.text);
    if (tens !== undefined) {
      if (lastPart === "small" || lastPart === "tens") break;
      current += tens;
      sawNumber = true;
      lastPart = "tens";
      index += 1;
      continue;
    }

    if (token.text === "hundred") {
      if (lastPart === "hundred" || lastPart === "scale") break;
      current = (current || 1) * 100;
      sawNumber = true;
      lastPart = "hundred";
      index += 1;
      continue;
    }

    const scale = valueOf(LARGE_SCALES, token.text);
    if (scale !== undefined) {
      if (lastPart === "scale") break;
      total += (current || 1) * scale;
      current = 0;
      sawNumber = true;
      lastPart = "scale";
      index += 1;
      continue;
    }
    break;
  }

  return sawNumber ? { endToken: index, value: total + current } : null;
};

const parseDigitSequence = (
  text: string,
  tokens: readonly WordToken[],
  startToken: number,
): { endToken: number; digits: string } | null => {
  let index = startToken;
  let digits = "";
  while (index < tokens.length) {
    if (index > startToken && !tokensAreAdjacent(text, tokens[index - 1], tokens[index])) break;
    const digit = DIGITS[tokens[index].text];
    if (digit === undefined) break;
    digits += digit;
    index += 1;
  }
  if (index - startToken < 2) return null;
  const next = tokens[index];
  if (next && tokensAreAdjacent(text, tokens[index - 1], next) && isCardinalWord(next.text))
    return null;
  return { endToken: index, digits };
};

const parseUnderHundred = (
  text: string,
  tokens: readonly WordToken[],
  startToken: number,
): { endToken: number; value: number } | null => {
  const first = tokens[startToken];
  if (!first) return null;
  const small = valueOf(SMALL_NUMBERS, first.text);
  if (small !== undefined) return { endToken: startToken + 1, value: small };
  const tens = valueOf(TENS, first.text);
  if (tens === undefined) return null;
  const next = tokens[startToken + 1];
  const nextSmall = next ? valueOf(SMALL_NUMBERS, next.text) : undefined;
  if (
    next &&
    nextSmall !== undefined &&
    nextSmall > 0 &&
    nextSmall < 10 &&
    tokensAreAdjacent(text, first, next)
  )
    return { endToken: startToken + 2, value: tens + nextSmall };
  return { endToken: startToken + 1, value: tens };
};

const parseYear = (
  text: string,
  tokens: readonly WordToken[],
  startToken: number,
): NumberMatch | null => {
  const firstToken = tokens[startToken];
  const first = firstToken
    ? (valueOf(SMALL_NUMBERS, firstToken.text) ?? valueOf(TENS, firstToken.text))
    : undefined;
  if (first !== 19 && first !== 20) return null;
  const secondToken = tokens[startToken + 1];
  if (!secondToken || !tokensAreAdjacent(text, firstToken, secondToken)) return null;

  if (secondToken.text === "oh" || secondToken.text === "zero") {
    const lastToken = tokens[startToken + 2];
    const last = lastToken ? DIGITS[lastToken.text] : undefined;
    if (!lastToken || last === undefined || !tokensAreAdjacent(text, secondToken, lastToken))
      return null;
    return { endToken: startToken + 3, text: String(first * 100 + Number(last)) };
  }

  const second = parseUnderHundred(text, tokens, startToken + 1);
  if (!second || second.value < 10) return null;
  return { endToken: second.endToken, text: String(first * 100 + second.value) };
};

const formatInteger = (value: number): string => {
  const sign = value < 0 ? "-" : "";
  const digits = String(Math.abs(value));
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ",")}`;
};

const parseNumber = (
  text: string,
  tokens: readonly WordToken[],
  startToken: number,
): NumberMatch | null => {
  let numberStart = startToken;
  let negative = false;
  if (tokens[numberStart]?.text === "minus" || tokens[numberStart]?.text === "negative") {
    const next = tokens[numberStart + 1];
    if (!next || !tokensAreAdjacent(text, tokens[numberStart], next)) return null;
    negative = true;
    numberStart += 1;
  }

  const cardinal = parseCardinal(text, tokens, numberStart);
  if (cardinal) {
    const point = tokens[cardinal.endToken];
    if (point?.text === "point" && tokensAreAdjacent(text, tokens[cardinal.endToken - 1], point)) {
      let index = cardinal.endToken + 1;
      let fraction = "";
      while (index < tokens.length) {
        if (!tokensAreAdjacent(text, tokens[index - 1], tokens[index])) break;
        const digit = DIGITS[tokens[index].text];
        if (digit === undefined) break;
        fraction += digit;
        index += 1;
      }
      if (fraction)
        return {
          endToken: index,
          text: `${negative ? "-" : ""}${formatInteger(cardinal.value)}.${fraction}`,
        };
    }
  }

  const year = !negative ? parseYear(text, tokens, numberStart) : null;
  if (year) return year;

  const digitSequence = parseDigitSequence(text, tokens, numberStart);
  if (digitSequence) {
    const value = Number(digitSequence.digits);
    if (Number.isSafeInteger(value))
      return {
        endToken: digitSequence.endToken,
        text: `${negative ? "-" : ""}${formatInteger(value)}`,
      };
  }

  if (!cardinal || !Number.isSafeInteger(cardinal.value)) return null;
  const value = negative ? -cardinal.value : cardinal.value;
  return { endToken: cardinal.endToken, text: formatInteger(value) };
};

const planReplacements = (
  text: string,
  sourceRanges?: ReadonlyArray<{ start: number; end: number }>,
): { tokens: WordToken[]; replacements: Replacement[] } => {
  const tokens = tokenizeWords(text, sourceRanges);
  const replacements: Replacement[] = [];
  let index = 0;
  while (index < tokens.length) {
    const number = parseNumber(text, tokens, index);
    if (!number) {
      index += 1;
      continue;
    }

    const parts: ReplacementPart[] = [
      { text: number.text, startToken: index, endToken: number.endToken },
    ];
    let endToken = number.endToken;
    const unit = tokens[endToken];
    const previous = tokens[endToken - 1];
    const normalizedUnit = unit ? MEASUREMENT_UNITS[unit.text] : undefined;
    if (unit && previous && normalizedUnit && tokensAreAdjacent(text, previous, unit)) {
      parts.push({ text: normalizedUnit, startToken: endToken, endToken: endToken + 1 });
      endToken += 1;
    }

    replacements.push({
      start: tokens[index].start,
      end: tokens[endToken - 1].end,
      startToken: index,
      endToken,
      parts,
    });
    index = endToken;
  }
  return { tokens, replacements };
};

const applyReplacements = (text: string, replacements: readonly Replacement[]): string => {
  if (replacements.length === 0) return text;
  let output = "";
  let cursor = 0;
  for (const replacement of replacements) {
    output += text.slice(cursor, replacement.start);
    output += replacement.parts.map((part) => part.text).join(" ");
    cursor = replacement.end;
  }
  return output + text.slice(cursor);
};

export const inverseNormalizeEnglishText = (text: string): string => {
  const { replacements } = planReplacements(text);
  return applyReplacements(text, replacements);
};

const normalizeTimestampedWords = (
  words: readonly NemotronTimestampedWord[],
): NemotronTimestampedWord[] => {
  if (words.length === 0) return [];
  const ranges: Array<{ start: number; end: number }> = [];
  let sourceText = "";
  for (const word of words) {
    if (sourceText) sourceText += " ";
    const start = sourceText.length;
    sourceText += word.text;
    ranges.push({ start, end: sourceText.length });
  }

  const { tokens, replacements } = planReplacements(sourceText, ranges);
  if (replacements.length === 0) return words.map((word) => ({ ...word }));

  const replacementByWord = new Map<
    number,
    { endWord: number; words: NemotronTimestampedWord[] }
  >();
  for (const replacement of replacements) {
    const firstToken = tokens[replacement.startToken];
    const lastToken = tokens[replacement.endToken - 1];
    const startWord = firstToken.sourceWordIndex;
    const endWord = lastToken.sourceWordIndex;
    if (startWord === undefined || endWord === undefined) continue;
    const prefix = words[startWord].text.slice(0, firstToken.start - ranges[startWord].start);
    const suffix = words[endWord].text.slice(lastToken.end - ranges[endWord].start);
    const normalizedWords = replacement.parts.map((part, partIndex) => {
      const partStart = tokens[part.startToken].sourceWordIndex ?? startWord;
      const partEnd = tokens[part.endToken - 1].sourceWordIndex ?? endWord;
      return {
        text: `${partIndex === 0 ? prefix : ""}${part.text}${
          partIndex === replacement.parts.length - 1 ? suffix : ""
        }`,
        timestamp: [words[partStart].timestamp[0], words[partEnd].timestamp[1]] as [number, number],
      };
    });
    replacementByWord.set(startWord, { endWord, words: normalizedWords });
  }

  const output: NemotronTimestampedWord[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const replacement = replacementByWord.get(index);
    if (!replacement) {
      output.push({ ...words[index] });
      continue;
    }
    output.push(...replacement.words);
    index = replacement.endWord;
  }
  return output;
};

/**
 * Browser-safe English subset of NeMo inverse text normalization for Nemotron's
 * spoken-form ASR output. The upstream Python entry point delegates to Pynini/OpenFst
 * grammars, so this implementation keeps the close-time path dependency-free and
 * currently covers cardinal numbers, spoken years, decimals, and common metric units.
 */
export const inverseNormalizeNemotronTranscript = (
  text: string,
  words?: readonly NemotronTimestampedWord[],
): InverseNormalizedTranscript => ({
  text: inverseNormalizeEnglishText(text),
  ...(words ? { words: normalizeTimestampedWords(words) } : {}),
});
