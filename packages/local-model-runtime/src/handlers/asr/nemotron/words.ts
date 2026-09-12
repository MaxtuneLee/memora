export const tokenToText = (token: string): string => {
  if (!token || /^<[^>]+>$/.test(token)) return "";
  return token.replaceAll("▁", " ");
};

export interface EmittedToken {
  text: string;
  seconds: number;
}

export const tokensToTimestampedWords = (
  tokens: readonly EmittedToken[],
  durationSeconds: number,
): Array<{ text: string; timestamp: [number, number] }> => {
  // Rebuild the same concatenated string `transcript` uses (so word boundaries always
  // match the live preview), tracking which token each character came from. Splitting
  // on the combined text handles a token that's pure whitespace correctly — a lone "▁"
  // marker emitted as its own token still splits the words on either side of it,
  // instead of being silently dropped and letting the next subword fuse onto the
  // previous word.
  let combined = "";
  const secondsAtChar: number[] = [];
  for (const token of tokens) {
    for (const char of token.text) {
      combined += char;
      secondsAtChar.push(token.seconds);
    }
  }
  const words: Array<{ text: string; start: number }> = [];
  for (const match of combined.matchAll(/\S+/g)) {
    words.push({ text: match[0], start: secondsAtChar[match.index] ?? 0 });
  }
  return words.map((word, index) => ({
    text: word.text,
    timestamp: [word.start, Math.max(word.start, words[index + 1]?.start ?? durationSeconds)],
  }));
};
