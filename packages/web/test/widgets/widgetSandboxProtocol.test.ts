import { describe, expect, it } from "vite-plus/test";

import {
  HOST_MESSAGE,
  RUNNER_MESSAGE,
  parseHostMessage,
  parseRunnerMessage,
} from "@/lib/widgets/sandbox/protocol";

describe("parseRunnerMessage", () => {
  it("accepts well-formed messages from the frame", () => {
    expect(parseRunnerMessage({ type: RUNNER_MESSAGE.boot })).toEqual({
      type: RUNNER_MESSAGE.boot,
    });
    expect(
      parseRunnerMessage({ type: RUNNER_MESSAGE.resize, height: 120, hasContent: true }),
    ).toEqual({ type: RUNNER_MESSAGE.resize, height: 120, hasContent: true });
    expect(
      parseRunnerMessage({
        type: RUNNER_MESSAGE.writeData,
        requestId: "1",
        name: "a.json",
        content: "{}",
      }),
    ).toEqual({ type: RUNNER_MESSAGE.writeData, requestId: "1", name: "a.json", content: "{}" });
  });

  it("drops anything that is not an object with a known type", () => {
    expect(parseRunnerMessage(null)).toBeNull();
    expect(parseRunnerMessage("memora:widget:boot")).toBeNull();
    expect(parseRunnerMessage({ type: "memora:widget:unknown" })).toBeNull();
    expect(parseRunnerMessage({ type: RUNNER_MESSAGE.boot.toUpperCase() })).toBeNull();
  });

  it("drops messages whose fields have the wrong type", () => {
    expect(
      parseRunnerMessage({ type: RUNNER_MESSAGE.resize, height: "tall", hasContent: true }),
    ).toBeNull();
    expect(parseRunnerMessage({ type: RUNNER_MESSAGE.sendPrompt, text: 5 })).toBeNull();
    expect(parseRunnerMessage({ type: RUNNER_MESSAGE.openLink })).toBeNull();
    expect(parseRunnerMessage({ type: RUNNER_MESSAGE.pong, seq: "1" })).toBeNull();
    expect(
      parseRunnerMessage({ type: RUNNER_MESSAGE.writeData, requestId: 1, name: "a", content: "b" }),
    ).toBeNull();
  });

  it("treats an unknown error kind as a script error", () => {
    expect(
      parseRunnerMessage({ type: RUNNER_MESSAGE.error, kind: "other", message: "boom" }),
    ).toEqual({ type: RUNNER_MESSAGE.error, kind: "script", signature: null, message: "boom" });
  });
});

describe("parseHostMessage", () => {
  it("accepts a run message with inline and external scripts", () => {
    const message = {
      type: HOST_MESSAGE.run,
      signature: "s",
      scripts: [{ src: "https://cdn.jsdelivr.net/a.js" }, { content: "1" }],
    };
    expect(parseHostMessage(message)).toEqual(message);
  });

  it("rejects a run message with a malformed script entry", () => {
    expect(
      parseHostMessage({ type: HOST_MESSAGE.run, signature: "s", scripts: [{ nope: 1 }] }),
    ).toBeNull();
    expect(parseHostMessage({ type: HOST_MESSAGE.run, signature: "s", scripts: "x" })).toBeNull();
  });

  it("only accepts the two theme literals", () => {
    expect(parseHostMessage({ type: HOST_MESSAGE.theme, theme: "dark" })).toEqual({
      type: HOST_MESSAGE.theme,
      theme: "dark",
    });
    expect(parseHostMessage({ type: HOST_MESSAGE.theme, theme: "purple" })).toBeNull();
    expect(parseHostMessage({ type: HOST_MESSAGE.theme })).toBeNull();
  });
});
