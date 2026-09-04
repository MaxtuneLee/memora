import { DatabaseSync } from "node:sqlite";
import { expect, test, vi } from "vite-plus/test";
import type { LocalChatEvent } from "@memora/local-model-runtime";

import { normalizeLocalTokenUsage, trackLocalTokenUsage } from "@/lib/models/localTokenUsage";
import { localModelUsageEvents, localModelUsageMaterializers } from "@/livestore/localModelUsage";
import { schema } from "@/livestore/schema";

async function* events(items: LocalChatEvent[]): AsyncGenerator<LocalChatEvent> {
  yield* items;
}
const usage: LocalChatEvent = { type: "usage", inputTokens: 10, outputTokens: 5, totalTokens: 15 };

test("counts the latest actual usage once after a successful local generation", async () => {
  const record = vi.fn();
  const source: LocalChatEvent[] = [usage, usage, { type: "status", status: "completed" }];
  const received: LocalChatEvent[] = [];
  for await (const event of trackLocalTokenUsage(events(source), record)) received.push(event);
  expect(received).toEqual(source);
  expect(record).toHaveBeenCalledExactlyOnceWith({ inputTokens: 10, outputTokens: 5 });
});

test.each(["failed", "aborted"] as const)("does not count %s tasks", async (status) => {
  const record = vi.fn();
  for await (const _event of trackLocalTokenUsage(
    events([usage, { type: "status", status }]),
    record,
  )) {
    /* consume */
  }
  expect(record).not.toHaveBeenCalled();
});

test("does not count interrupted streams or missing/invalid usage", async () => {
  const record = vi.fn();
  for await (const _event of trackLocalTokenUsage(events([usage]), record)) break;
  for await (const _event of trackLocalTokenUsage(events([{ type: "chat-complete" }]), record)) {
    /* consume */
  }
  const controller = new AbortController();
  controller.abort();
  for await (const _event of trackLocalTokenUsage(events([usage]), record, controller.signal)) {
    /* consume */
  }
  expect(record).not.toHaveBeenCalled();
  for (const invalid of [
    null,
    {},
    { inputTokens: -1, outputTokens: 2 },
    { inputTokens: NaN, outputTokens: 1 },
    { inputTokens: 1.2, outputTokens: 3 },
  ])
    expect(normalizeLocalTokenUsage(invalid)).toBeNull();
});

test("atomically accumulates device-local usage in existing settings without changing routes", () => {
  expect(localModelUsageEvents.localModelUsageRecorded.options.clientOnly).toBe(true);
  expect(schema.state.materializers.has("v1.LocalModelUsageRecorded")).toBe(true);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE settings (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare("INSERT INTO settings VALUES (?, ?)").run(
      "user-settings",
      JSON.stringify({
        theme: "dark",
        modelRouting: { personality: { source: "inherit", featureId: "assistant" } },
      }),
    );
    for (const value of [
      { inputTokens: 10, outputTokens: 5 },
      { inputTokens: 20, outputTokens: 7 },
    ]) {
      const statement = localModelUsageMaterializers["v1.LocalModelUsageRecorded"](value);
      if ("sql" in statement) db.prepare(statement.sql).run(...statement.bindValues);
    }
    const row = db.prepare("SELECT value FROM settings").get();
    expect(JSON.parse(String(row?.value))).toEqual({
      theme: "dark",
      modelRouting: { personality: { source: "inherit", featureId: "assistant" } },
      localModelTokenUsage: {
        inputTokens: 30,
        outputTokens: 12,
        allInputTokens: 30,
        allOutputTokens: 12,
        totalCommands: 2,
      },
    });
    expect(
      localModelUsageMaterializers["v1.LocalModelUsageRecorded"]({
        inputTokens: -1,
        outputTokens: 2,
      }),
    ).toEqual([]);
  } finally {
    db.close();
  }
});

test("does not turn an unknown historical command count into a fabricated total", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE settings (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare("INSERT INTO settings VALUES (?, ?)").run(
      "user-settings",
      JSON.stringify({ localModelTokenUsage: { inputTokens: 100, outputTokens: 20 } }),
    );
    const statement = localModelUsageMaterializers["v1.LocalModelUsageRecorded"]({
      inputTokens: 10,
      outputTokens: 5,
    });
    if ("sql" in statement) db.prepare(statement.sql).run(...statement.bindValues);
    const row = db.prepare("SELECT value FROM settings").get();
    expect(JSON.parse(String(row?.value)).localModelTokenUsage).toEqual({
      inputTokens: 110,
      outputTokens: 25,
      allInputTokens: 110,
      allOutputTokens: 25,
    });
  } finally {
    db.close();
  }
});

test("adds cloud usage to the denominator without increasing saved tokens", () => {
  expect(localModelUsageEvents.cloudModelUsageRecorded.options.clientOnly).toBe(true);
  expect(schema.state.materializers.has("v1.CloudModelUsageRecorded")).toBe(true);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE settings (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
    for (const [name, value] of [
      ["v1.LocalModelUsageRecorded", { inputTokens: 80, outputTokens: 20 }],
      ["v1.CloudModelUsageRecorded", { inputTokens: 300, outputTokens: 100 }],
    ] as const) {
      const statement = localModelUsageMaterializers[name](value);
      if ("sql" in statement) db.prepare(statement.sql).run(...statement.bindValues);
    }
    const row = db.prepare("SELECT value FROM settings").get();
    expect(JSON.parse(String(row?.value)).localModelTokenUsage).toEqual({
      inputTokens: 80,
      outputTokens: 20,
      allInputTokens: 380,
      allOutputTokens: 120,
      totalCommands: 2,
    });
  } finally {
    db.close();
  }
});
