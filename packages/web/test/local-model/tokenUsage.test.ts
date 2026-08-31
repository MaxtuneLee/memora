import type { LocalChatEvent } from "@memora/local-model-runtime";
import { expect, test } from "vite-plus/test";

import { createTokenUsageEvent } from "@/workers/local-model/chat/tokenUsage";
import { runTextGeneration } from "@/workers/local-model/chat/generation";
import { __private__ } from "@/workers/local-model/chat/gemma4";

test("counts token tensor dimensions, never string length estimates", () => {
  expect(createTokenUsageEvent({ dims: [1, 8] }, 3)).toEqual({
    type: "usage",
    inputTokens: 8,
    outputTokens: 3,
    totalTokens: 11,
  });
  expect(createTokenUsageEvent({}, 3)).toBeNull();
  expect(createTokenUsageEvent({ dims: [2, 8] }, 3)).toBeNull();
  expect(createTokenUsageEvent({ dims: [1, -8] }, 3)).toBeNull();
});

test.each(["qwen", "gemma"] as const)(
  "%s emits actual prompt and generated token counts",
  async (family) => {
    const emitted: LocalChatEvent[] = [];
    const tokenizer = Object.assign(() => ({ input_ids: { dims: [1, 3] } }), {
      all_special_ids: [],
      decode: () => "hello",
    });
    const processor = Object.assign(async () => ({ input_ids: { dims: [1, 3] } }), {
      tokenizer,
      apply_chat_template: () => "prompt",
    });
    const model = {
      async generate(input: { streamer?: { put: (tokens: bigint[][]) => void; end: () => void } }) {
        input.streamer?.put([[1n, 2n, 3n]]);
        input.streamer?.put([[4n]]);
        input.streamer?.put([[5n]]);
        input.streamer?.end();
      },
    };
    const common = {
      processor,
      messages: [],
      generationConfig: {},
      emit: (event: LocalChatEvent) => emitted.push(event),
      canceled: () => false,
    };
    if (family === "qwen") await runTextGeneration({ ...common, model });
    else
      await __private__.runGemmaTextGeneration({
        ...common,
        model: model as unknown as Parameters<
          typeof __private__.runGemmaTextGeneration
        >[0]["model"],
      });
    expect(emitted.filter((event) => event.type === "usage")).toEqual([
      { type: "usage", inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    ]);
  },
);
