import { describe, expect, it } from "vite-plus/test";

import { shareEqual } from "@/lib/agent-runtime/client";

describe("shareEqual", () => {
  it("reuses unchanged messages when only the streaming message changes", () => {
    const previous = {
      messages: [
        { id: "a", role: "user", content: "hi", attachments: [{ id: "x" }] },
        { id: "b", role: "assistant", content: "Hel" },
      ],
    };
    const next = structuredClone(previous);
    next.messages[1].content = "Hello";

    const result = shareEqual(previous, next);

    expect(result).not.toBe(previous);
    expect(result.messages[0]).toBe(previous.messages[0]);
    expect(result.messages[1]).not.toBe(previous.messages[1]);
    expect(result.messages[1].content).toBe("Hello");
    expect(shareEqual(previous, structuredClone(previous))).toBe(previous);
  });

  it("treats swapped keys and removed items as changes", () => {
    const previous: Record<string, unknown> = { a: 1 };
    expect(shareEqual(previous, { b: undefined })).not.toBe(previous);
    const list = [1, 2];
    expect(shareEqual(list, [1])).toEqual([1]);
  });
});
