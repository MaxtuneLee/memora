import { describe, expect, test } from "vite-plus/test";

import {
  defaultSettings,
  mergeSettings,
  settingEvents,
  settingMaterializers,
  settingsToMigrate,
} from "@/livestore/setting";

const row = (key: string, value: unknown) => ({ key, value: JSON.stringify(value) });

describe("settings sync", () => {
  test("synced values win over the device document, except device-only fields", () => {
    const merged = mergeSettings({ ...defaultSettings, theme: "light", sidebarCollapsed: true }, [
      row("theme", "dark"),
      row("sidebarCollapsed", false),
    ]);
    expect(merged.theme).toBe("dark");
    expect(merged.sidebarCollapsed).toBe(true);
  });

  test("a change leaves device-only fields out of the synced event", () => {
    const event = settingEvents.settingsSet({ theme: "dark", logCollectionEnabled: true });
    expect(event.name).toBe("v1.SettingsUpdated");
    expect(event.args.value).toEqual({ theme: "dark" });
  });

  test("WebMCP access stays on this device, including migration and incoming sync", () => {
    const local = {
      ...defaultSettings,
      webMcpEnabled: true,
      webMcpReadEnabled: false,
      webMcpWriteEnabled: true,
    };
    expect(settingEvents.settingsSet(local).args.value).not.toHaveProperty("webMcpEnabled");
    expect(settingsToMigrate(local, new Set())).toEqual({});
    const merged = mergeSettings(local, [
      row("webMcpEnabled", false),
      row("webMcpReadEnabled", true),
      row("webMcpWriteEnabled", false),
    ]);
    expect(merged.webMcpEnabled).toBe(true);
    expect(merged.webMcpReadEnabled).toBe(false);
    expect(merged.webMcpWriteEnabled).toBe(true);
  });

  test("each setting is stored as its own row, so different changes from two devices both stay", () => {
    const writes = settingMaterializers["v1.SettingsUpdated"]({
      value: {
        theme: "dark",
        editorFontSizePx: 18,
        localModelTokenUsage: { inputTokens: 1, outputTokens: 1 },
      },
    });
    expect(writes).toHaveLength(2);
  });

  test("migration copies only changed settings that no device has synced yet", () => {
    const device = {
      ...defaultSettings,
      theme: "dark" as const,
      language: "zh-CN",
      logCollectionEnabled: true,
    };
    expect(settingsToMigrate(device, new Set(["language"]))).toEqual({ theme: "dark" });
    expect(settingsToMigrate(defaultSettings, new Set())).toEqual({});
  });
});
