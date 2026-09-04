import { DatabaseSync } from "node:sqlite";
import { Schema } from "@livestore/livestore";
import { describe, expect, test } from "vite-plus/test";

import { schema } from "@/livestore/schema";
import { defaultSettings, settingEvents, settingsStoredValueSchema } from "@/livestore/setting";
import {
  legacyModelRoutingEvents,
  legacyModelRoutingMaterializers,
} from "@/livestore/legacyModelRouting";
import type { StoredModelRouting } from "@/lib/models/modelRoutingSchema";

describe("model routing stored in settings", () => {
  test("uses the existing settings document and keeps its events client-only", () => {
    expect(schema.state.sqlite.tables.has("settings")).toBe(true);
    expect(schema.state.sqlite.tables.has("ai_model_routing")).toBe(false);
    expect(settingEvents.settingsSet.options.clientOnly).toBe(true);
    expect(legacyModelRoutingEvents.legacyModelRoutingSet.options.clientOnly).toBe(true);
    expect(schema.state.materializers.has("ai_model_routingSet")).toBe(true);
    expect(Schema.decodeUnknownSync(settingsStoredValueSchema)({ theme: "dark" })).toEqual({
      theme: "dark",
    });
    expect(() =>
      Schema.decodeUnknownSync(settingsStoredValueSchema)({
        modelRouting: { assistant: { source: "local", modelId: "gemma-4-e2b-it-onnx" } },
      }),
    ).toThrow();
  });

  test("replays legacy partial routes into settings without losing preferences or other features", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("CREATE TABLE settings (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
      const replay = (value: StoredModelRouting) => {
        const result = legacyModelRoutingMaterializers.ai_model_routingSet({
          id: "feature-models",
          value,
        });
        if ("sql" in result) db.prepare(result.sql).run(...result.bindValues);
      };
      const readSettings = () => {
        const row = db.prepare("SELECT value FROM settings WHERE id = 'user-settings'").get();
        return Schema.decodeUnknownSync(settingsStoredValueSchema)(JSON.parse(String(row?.value)));
      };
      replay({
        transcription: { source: "cloud", providerId: "asr", modelId: "scribe_v2_realtime" },
      });
      expect(readSettings().language).toBe(defaultSettings.language);
      db.exec("UPDATE settings SET value = json_set(value, '$.theme', 'dark')");
      replay({ sessionTitle: { source: "local", modelId: "gemma-4-e2b-it-onnx" } });
      replay({ transcription: { source: "local", modelId: "whisper-base-timestamped" } });
      expect(readSettings()).toMatchObject({
        theme: "dark",
        modelRouting: {
          transcription: { source: "local", modelId: "whisper-base-timestamped" },
          sessionTitle: { source: "local", modelId: "gemma-4-e2b-it-onnx" },
        },
      });
      expect(readSettings().modelRouting?.transcription).not.toHaveProperty("providerId");
      expect(
        legacyModelRoutingMaterializers.ai_model_routingSet({ id: "other", value: {} }),
      ).toEqual([]);
    } finally {
      db.close();
    }
  });

  test("replays routing into a settings document created before modelRouting existed", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("CREATE TABLE settings (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
      db.prepare("INSERT INTO settings VALUES (?, ?)").run(
        "user-settings",
        JSON.stringify({ theme: "dark" }),
      );
      const result = legacyModelRoutingMaterializers.ai_model_routingSet({
        id: "feature-models",
        value: { memoryExtraction: { source: "inherit", featureId: "assistant" } },
      });
      if ("sql" in result) db.prepare(result.sql).run(...result.bindValues);
      const row = db.prepare("SELECT value FROM settings").get();
      expect(JSON.parse(String(row?.value))).toEqual({
        theme: "dark",
        modelRouting: { memoryExtraction: { source: "inherit", featureId: "assistant" } },
      });
    } finally {
      db.close();
    }
  });
});
