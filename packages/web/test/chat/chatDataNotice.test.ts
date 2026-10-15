import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import {
  answerChatDataNotice,
  ensureChatDataNoticeAcknowledged,
  hostOf,
} from "@/lib/chat/chatDataNotice";

const storage = new Map<string, string>();
const openai = { providerName: "OpenAI", host: "api.openai.com" };

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

afterEach(() => {
  answerChatDataNotice(false);
  vi.unstubAllGlobals();
});

test("asks once per host and remembers the answer", async () => {
  const first = ensureChatDataNoticeAcknowledged(openai);
  answerChatDataNotice(true);
  await expect(first).resolves.toBeUndefined();

  // Already acknowledged: resolves without waiting for an answer.
  await expect(ensureChatDataNoticeAcknowledged(openai)).resolves.toBeUndefined();

  let settled = false;
  const other = ensureChatDataNoticeAcknowledged({
    providerName: "Claude",
    host: "api.anthropic.com",
  });
  void other.then(() => (settled = true));
  await Promise.resolve();
  expect(settled).toBe(false);
  answerChatDataNotice(true);
  await other;
});

test("dismissing the notice stops the send and asks again next time", async () => {
  const first = ensureChatDataNoticeAcknowledged(openai);
  answerChatDataNotice(false);
  await expect(first).rejects.toThrow(/wasn't sent/);

  const second = ensureChatDataNoticeAcknowledged(openai);
  answerChatDataNotice(true);
  await expect(second).resolves.toBeUndefined();
});

test("uses the API host from the provider URL", () => {
  expect(hostOf("https://api.openai.com/v1")).toBe("api.openai.com");
  expect(hostOf("not a url")).toBe("not a url");
});
