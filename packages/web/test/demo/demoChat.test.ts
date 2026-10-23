import { expect, test } from "vite-plus/test";
import type { LocalChatMessage, LocalChatRequest } from "@memora/local-model-runtime";

import { DEMO_LECTURE_SEGMENTS } from "@/lib/demo/bayesLecture";
import { scriptDemoReply } from "@/lib/demo/demoChat";
import { validateShowWidgetCall } from "@/lib/chat/showWidget";

const TOOLS = [{ name: "search_transcript", description: "", parameters: {} }];
const FILE_ID = "5dc7db14-47dc-4b4a-a81f-a383ea37e21d";

const request = (messages: LocalChatMessage[], tools = TOOLS): LocalChatRequest => ({
  modelId: "memora-demo",
  systemPrompt: "",
  messages,
  tools,
});

const user = (text: string): LocalChatMessage => ({
  role: "user",
  content: [{ type: "text", text }],
});

// Replays the scripted turn, answering each tool call the way the app would.
const playTurn = (fileId: string | null) => {
  const messages: LocalChatMessage[] = [user("Teach me Bayes' theorem from my lecture")];
  const replies = [];
  for (let step = 0; step < 10; step++) {
    const reply = scriptDemoReply(request(messages));
    replies.push(reply);
    if (!reply.tools?.length) break;
    messages.push({
      role: "assistant",
      content: reply.tools.map((tool, index) => ({
        type: "tool_call",
        id: `${step}-${index}`,
        name: tool.name,
        arguments: tool.args,
      })),
    });
    for (const [index, tool] of reply.tools.entries()) {
      const result =
        tool.name === "search_transcript" && fileId
          ? JSON.stringify({ matches: [{ fileId, fileName: "Bayes' theorem lecture" }] })
          : "{}";
      messages.push({
        role: "tool",
        content: [{ type: "tool_result", id: `${step}-${index}`, name: tool.name, result }],
      });
    }
  }
  return replies;
};

test("the lesson turn looks up the lecture, loads the skill, then shows the widget", () => {
  const replies = playTurn(FILE_ID);
  expect(replies.map((reply) => reply.tools?.map((tool) => tool.name) ?? [])).toEqual([
    ["search_transcript"],
    ["read_transcript"],
    ["activate_skill"],
    ["read_skill_resource", "read_skill_resource", "read_skill_resource"],
    ["show_widget"],
    [],
  ]);
  const lesson = replies[4];
  expect(lesson.text).toContain(`fileId="${FILE_ID}"`);
  const widget = lesson.tools?.[0].args;
  expect(
    validateShowWidgetCall({
      title: String(widget?.title),
      widget_code: String(widget?.widget_code),
    } as Parameters<typeof validateShowWidgetCall>[0]),
  ).toBeNull();
});

test("without a saved lecture the lesson skips reading it and cites nothing", () => {
  const replies = playTurn(null);
  const names = replies.flatMap((reply) => reply.tools?.map((tool) => tool.name) ?? []);
  expect(names).not.toContain("read_transcript");
  expect(replies.find((reply) => reply.text)?.text).not.toContain("<memora-jump");
});

test("lesson results, titles and other questions get their own replies", () => {
  expect(scriptDemoReply(request([user("Lesson result: Bayes' theorem — 2/2")])).text).toMatch(
    /^2 out of 2/,
  );
  expect(
    scriptDemoReply(request([user("Create a concise title for this conversation")], [])).text,
  ).toBe("Bayes' theorem from the lecture");
  expect(scriptDemoReply(request([user("What's the weather?")])).text).toContain("demo mode");
});

test("lecture segments are in order and keep every word timed", () => {
  const readyTimes = DEMO_LECTURE_SEGMENTS.map((segment) => segment.readyAt);
  expect(readyTimes).toEqual([...readyTimes].sort((a, b) => a - b));
  for (const segment of DEMO_LECTURE_SEGMENTS) {
    expect(segment.words.length).toBeGreaterThan(0);
    for (const word of segment.words) expect(word.timestamp[1]).toBeGreaterThan(word.timestamp[0]);
  }
  expect(DEMO_LECTURE_SEGMENTS.map((segment) => segment.text).join(" ")).toContain(
    "The prior matters far more than most people expect.",
  );
});
