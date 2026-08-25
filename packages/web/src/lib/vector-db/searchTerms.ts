const ENGLISH_STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "i",
  "in",
  "is",
  "it",
  "made",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
]);

const isEnglishStopWord = (term: string): boolean => {
  return /^[a-z]+$/u.test(term) && ENGLISH_STOP_WORDS.has(term);
};

export const filterSearchTerms = (terms: string[]): string[] => {
  const meaningfulTerms = terms.filter((term) => !isEnglishStopWord(term));
  return meaningfulTerms.length > 0 ? meaningfulTerms : terms;
};

export const getSearchTerms = (query: string): string[] => {
  const segments = query.toLocaleLowerCase().match(/[a-z0-9]+|[\p{Script=Han}]+/gu) ?? [];
  const terms = segments.flatMap((segment) => {
    const chineseCharacters = segment.match(/\p{Script=Han}/gu) ?? [];
    if (chineseCharacters.length < 2) return [segment];
    return chineseCharacters.slice(1).map((character, index) => {
      return `${chineseCharacters[index]}${character}`;
    });
  });
  return filterSearchTerms(Array.from(new Set(terms)));
};
