import { describe, expect, test } from "vite-plus/test";

import {
  parseChatTemplateToolCall,
  parseJsonToolCall,
  parseXmlToolCall,
} from "../../src/workers/local-model/chat/toolParsing";

describe("parseJsonToolCall", () => {
  test("parses a complete JSON tool call", () => {
    expect(parseJsonToolCall('{"name":"search","arguments":{"query":"memora"}}')).toEqual({
      name: "search",
      arguments: { query: "memora" },
    });
  });

  test("returns null for invalid arguments", () => {
    expect(parseJsonToolCall('{"name":"search","arguments":"bad"}')).toEqual(null);
  });
});

describe("parseChatTemplateToolCall", () => {
  test("parses Gemma-style chat template tool calls", () => {
    expect(
      parseChatTemplateToolCall('<|tool_call>call:vision{prompt:<|"|>Describe this frame<|"|>}<tool_call|>'),
    ).toEqual({
      name: "vision",
      arguments: { prompt: "Describe this frame" },
    });
  });

  test("parses unquoted Gemma-style numeric and boolean arguments", () => {
    expect(
      parseChatTemplateToolCall(
        '<|tool_call>call:list_chat_sessions{limit:1,include_archived:false}<tool_call|>',
      ),
    ).toEqual({
      name: "list_chat_sessions",
      arguments: { limit: 1, include_archived: false },
    });
  });
});

describe("parseXmlToolCall", () => {
  test("parses Qwen-style XML tool calls with loose parameters", () => {
    expect(
      parseXmlToolCall(
        [
          "🎤 正在读取您的最新录音！",
          "<tool_call>",
          "<function=read_chat_session>",
          "<parameter=session_id>",
          "chat_session_1",
          "<parameter=max_messages>",
          "20",
          "</tool_call>",
        ].join("\n"),
      ),
    ).toEqual({
      name: "read_chat_session",
      arguments: {
        session_id: "chat_session_1",
        max_messages: 20,
      },
    });
  });
});
