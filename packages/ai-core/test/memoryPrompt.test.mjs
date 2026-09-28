import assert from "node:assert/strict";
import test from "node:test";

import { createAgent, createInMemoryAdapter } from "../dist/index.js";

const fakeModel = {
  id: "fake-model",
  name: "Fake Model",
  api: "memora-test",
  provider: "memora-test",
  baseUrl: "memora://test",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32768,
  maxTokens: 4096,
};

const systemPromptFor = async (memory) => {
  const requests = [];
  const persistence = createInMemoryAdapter();
  await persistence.save("memory-prompt", "memory", memory);
  const agent = createAgent({
    config: { id: "memory-prompt", maxIterations: 1 },
    model: fakeModel,
    stream: (_model, context) => {
      requests.push(context);
      return (async function* stream() {
        yield { type: "text_delta", delta: "ok" };
      })();
    },
    persistence,
  });
  await agent.init();
  for await (const _event of agent.run("hi")) {
    // drain
  }
  return requests[0].systemPrompt;
};

test("lists saved preferences newest first with dates and says which one wins", async () => {
  const prompt = await systemPromptFor({
    personality: "## Preferred Assistant Style\nconcise",
    notices: [
      { text: "User prefers replies in English.", updatedAt: Date.UTC(2026, 0, 5) },
      { text: "User prefers replies in Chinese.", updatedAt: Date.UTC(2026, 8, 20) },
    ],
  });

  const section = prompt.slice(prompt.indexOf("## Stable User Preferences"));
  assert.match(section, /If two of these conflict, follow the newer one\./);
  assert.match(section, /overrides them\. They override the assistant style/);
  assert.ok(
    section.indexOf("- User prefers replies in Chinese. (saved 2026-09-20)") <
      section.indexOf("- User prefers replies in English. (saved 2026-01-05)"),
  );
});

test("keeps notices without a time in their given order and leaves out the personality rule", async () => {
  const prompt = await systemPromptFor({ notices: [{ text: "First." }, { text: "Second." }] });

  assert.ok(prompt.includes("- First.\n- Second."));
  assert.ok(!prompt.includes("personality context"));
});
