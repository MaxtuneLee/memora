import { describe, expect, test, vi } from "vite-plus/test";

import {
  autoReviewThenAsk,
  buildAutoReviewPrompt,
  type AutoReviewInput,
} from "@/lib/chat/autoReview";

const input: AutoReviewInput = {
  request: {
    tool: "modify_text_file",
    summary: "edit part of a file",
    access: "write",
    target: { kind: "path", path: "/chat/notes/plan.md" },
    write: {
      operation: "replace",
      contentLength: 12,
      overwrite: true,
      edits: [{ oldText: "SECRET OLD", newText: "SECRET NEW" }],
    },
  },
  args: {
    path: "/chat/notes/plan.md",
    operation: "replace",
    edits: [{ old_text: "SECRET OLD", new_text: "SECRET NEW" }],
    content: "SECRET CONTENT",
  },
  userMessages: ["Update my plan with the new dates."],
};

const runtimeReplying = (reply: string | Error) => {
  const prompts: string[] = [];
  return {
    prompts,
    runtime: {
      model: {} as never,
      stream: (async (_model: unknown, context: { messages: Array<{ content: string }> }) => {
        prompts.push(context.messages[0].content);
        if (reply instanceof Error) throw reply;
        if (reply === "hang") await new Promise(() => {});
        return (async function* () {
          yield { type: "text_delta", delta: reply };
        })();
      }) as never,
    },
  };
};

const review = (reply: string | Error) => {
  const { runtime, prompts } = runtimeReplying(reply);
  const askUser = vi.fn(async () => ({ decision: "allow_file" as const, source: "user" as const }));
  return {
    prompts,
    askUser,
    answer: autoReviewThenAsk(input, () => runtime, askUser, 20),
  };
};

describe("Auto review", () => {
  test("allows once with its reason", async () => {
    const { answer, askUser } = review(
      '{"decision":"allow","reason":"The user asked to update the plan."}',
    );
    expect(await answer).toEqual({
      decision: "allow_once",
      source: "auto",
      reason: "The user asked to update the plan.",
    });
    expect(askUser).not.toHaveBeenCalled();
  });

  test("denies with its reason", async () => {
    const { answer } = review('{"decision":"deny","reason":"Not requested."}');
    expect(await answer).toEqual({ decision: "deny", source: "auto", reason: "Not requested." });
  });

  test.each([
    ["unsure", '{"decision":"unsure","reason":"Hard to tell."}'],
    ["malformed output", "sure, go ahead"],
    ["an error", new Error("network")],
    ["a timeout", "hang"],
  ] as const)("hands %s to the user", async (_label, reply) => {
    const { answer, askUser } = review(reply);
    expect(await answer).toEqual({ decision: "allow_file", source: "user" });
    expect(askUser).toHaveBeenCalledWith(input.request);
  });

  test("never sees file or write content", async () => {
    const { answer, prompts } = review('{"decision":"allow","reason":"ok"}');
    await answer;
    expect(prompts[0]).toContain("Update my plan with the new dates.");
    expect(prompts[0]).toContain("/chat/notes/plan.md");
    expect(prompts[0]).toContain("Size: 12 characters");
    expect(prompts[0]).not.toContain("SECRET");
    expect(buildAutoReviewPrompt(input)).toBe(prompts[0]);
  });
});
