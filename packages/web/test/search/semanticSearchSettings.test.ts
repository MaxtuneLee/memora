import { describe, expect, test } from "vite-plus/test";

import {
  DEFAULT_SEMANTIC_SEARCH_SETTINGS,
  readSemanticSearchSettings,
  writeSemanticSearchSettings,
} from "@/lib/search/semanticSearchSettings";

describe("semantic search settings", () => {
  test("defaults to FTS without silently enabling a model", () => {
    expect(DEFAULT_SEMANTIC_SEARCH_SETTINGS).toEqual({ enabled: false, model: "bge-m3" });
  });

  test("round-trips an explicit local preference", () => {
    const original = globalThis.localStorage;
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    writeSemanticSearchSettings({ enabled: true, model: "bge-m3" });
    expect(readSemanticSearchSettings()).toEqual({ enabled: true, model: "bge-m3" });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
  });
});
