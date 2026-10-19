import { describe, expect, it } from "vite-plus/test";

import { toWidgetText } from "@/lib/widgets/sandbox/limits";
import { createWriteQueue, type WriteRequest } from "@/lib/widgets/sandbox/writeQueue";

const setup = () => {
  const sent: WriteRequest[] = [];
  const queue = createWriteQueue((request) => sent.push(request));
  return { sent, queue };
};

describe("createWriteQueue", () => {
  it("sends one request per file name at a time and resolves it when settled", async () => {
    const { sent, queue } = setup();

    const first = queue.write("a.json", "1");
    expect(sent).toEqual([{ requestId: "1", name: "a.json", content: "1" }]);

    queue.settle("1", true);
    await expect(first).resolves.toBeUndefined();
  });

  it("keeps only the last write made while one is in flight", async () => {
    const { sent, queue } = setup();

    const first = queue.write("a.json", "1");
    void queue.write("a.json", "2");
    const last = queue.write("a.json", "3");
    expect(sent).toHaveLength(1);

    queue.settle("1", true);
    await first;
    expect(sent.map((request) => request.content)).toEqual(["1", "3"]);

    queue.settle("2", true);
    await expect(last).resolves.toBeUndefined();
  });

  it("does not make different file names wait for each other", () => {
    const { sent, queue } = setup();

    void queue.write("a.json", "1");
    void queue.write("b.json", "2");

    expect(sent.map((request) => request.name)).toEqual(["a.json", "b.json"]);
  });

  it("rejects with the host's message and then sends the queued write", async () => {
    const { sent, queue } = setup();

    const first = queue.write("a.json", "1");
    void queue.write("a.json", "2");
    queue.settle("1", false, "not declared");

    await expect(first).rejects.toThrow("not declared");
    expect(sent).toHaveLength(2);
  });

  it("uses a default message and ignores an answer nobody is waiting for", async () => {
    const { queue } = setup();

    const first = queue.write("a.json", "1");
    queue.settle("1", false);
    queue.settle("99", true);

    await expect(first).rejects.toThrow("Write failed.");
  });
});

describe("toWidgetText", () => {
  it("keeps strings and stringifies numbers and booleans", () => {
    expect(toWidgetText("hi")).toBe("hi");
    expect(toWidgetText(5)).toBe("5");
    expect(toWidgetText(false)).toBe("false");
  });

  it("turns objects and missing values into an empty string", () => {
    expect(toWidgetText({})).toBe("");
    expect(toWidgetText(null)).toBe("");
    expect(toWidgetText(undefined)).toBe("");
  });
});
