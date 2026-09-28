import { describe, expect, it } from "vite-plus/test";

import { hasNoticeChanges, parseNoticeChanges } from "@/lib/chat/noticeExtractor";

const saved = [
  { id: "n-english", text: "User prefers replies in English." },
  { id: "n-emoji", text: "User prefers emoji." },
];

describe("parseNoticeChanges", () => {
  it("maps notice numbers back to the saved notices' IDs", () => {
    const changes = parseNoticeChanges(
      JSON.stringify({
        add: ["User prefers bullet points."],
        replace: [{ id: 1, text: "User prefers replies in Chinese." }],
        remove: ["2"],
      }),
      saved,
    );

    expect(changes).toEqual({
      add: ["User prefers bullet points."],
      replace: [{ id: "n-english", text: "User prefers replies in Chinese." }],
      remove: ["n-emoji"],
    });
  });

  it("adds a replacement whose number names no saved notice, and drops unknown removals", () => {
    const changes = parseNoticeChanges(
      JSON.stringify({ replace: [{ id: 7, text: "User prefers tables." }], remove: [9, "x"] }),
      saved,
    );

    expect(changes).toEqual({ add: ["User prefers tables."], replace: [], remove: [] });
  });

  it("still reads the earlier notices shape as additions", () => {
    const changes = parseNoticeChanges(
      JSON.stringify({ notices: ["User prefers tables.", "user prefers tables"] }),
      [],
    );

    expect(changes.add).toEqual(["User prefers tables."]);
  });

  it("treats an empty answer as no change", () => {
    const changes = parseNoticeChanges("", saved);

    expect(hasNoticeChanges(changes)).toBe(false);
  });
});
