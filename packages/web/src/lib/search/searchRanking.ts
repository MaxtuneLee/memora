import type { GlobalSearchItem } from "@/types/search";

const normalizeText = (value: string): string => {
  return value.trim().toLocaleLowerCase();
};

const tokenize = (value: string): string[] => {
  return normalizeText(value)
    .split(/[\s/\\:_-]+/u)
    .filter(Boolean);
};

const getSearchHaystack = (item: GlobalSearchItem): {
  title: string;
  tokens: string[];
  keywordText: string;
} => {
  const title = normalizeText(item.title);
  const keywordText = normalizeText(item.keywords.join(" "));
  const tokens = tokenize(`${item.title} ${item.keywords.join(" ")}`);

  return {
    title,
    tokens,
    keywordText,
  };
};

const scoreItem = (
  item: GlobalSearchItem,
  normalizedQuery: string,
  queryTokens: string[],
): number => {
  const { title, keywordText, tokens } = getSearchHaystack(item);

  if (title === normalizedQuery) return 500;
  if (title.startsWith(normalizedQuery)) return 420;

  const titleTokens = tokenize(item.title);
  const titlePrefixMatches = queryTokens.every((queryToken) =>
    titleTokens.some((token) => token.startsWith(queryToken)),
  );
  if (titlePrefixMatches) return 360;

  if (title.includes(normalizedQuery)) return 320;

  const keywordPrefixMatches = queryTokens.every((queryToken) =>
    tokens.some((token) => token.startsWith(queryToken)),
  );
  if (keywordPrefixMatches) return 240;

  if (keywordText.includes(normalizedQuery)) return 180;

  return 0;
};

export const rankSearchItems = (
  items: GlobalSearchItem[],
  query: string,
  limit = 24,
): GlobalSearchItem[] => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return items
      .slice()
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, limit);
  }

  const queryTokens = tokenize(normalizedQuery);

  return items
    .map((item) => ({
      item,
      score: scoreItem(item, normalizedQuery, queryTokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }

      const updatedAtDiff = (b.item.updatedAt ?? 0) - (a.item.updatedAt ?? 0);
      if (updatedAtDiff !== 0) {
        return updatedAtDiff;
      }

      return a.item.title.localeCompare(b.item.title);
    })
    .slice(0, limit)
    .map((entry) => entry.item);
};
