import { Events, Schema } from "@livestore/livestore";

import { normalizeLocalTokenUsage, type LocalTokenUsage } from "@/lib/models/localTokenUsage";
import { defaultSettings } from "./setting";

export const localModelUsageEvents = {
  localModelUsageRecorded: Events.clientOnly({
    name: "v1.LocalModelUsageRecorded",
    schema: Schema.Struct({ inputTokens: Schema.Number, outputTokens: Schema.Number }),
  }),
  cloudModelUsageRecorded: Events.clientOnly({
    name: "v1.CloudModelUsageRecorded",
    schema: Schema.Struct({ inputTokens: Schema.Number, outputTokens: Schema.Number }),
  }),
};

const incrementSql = (includeSavedTokens: boolean) => {
  const savedTokenUpdates = includeSavedTokens
    ? `'$.localModelTokenUsage.inputTokens', MIN(4503599627370495, MAX(0, COALESCE(CAST(json_extract(value, '$.localModelTokenUsage.inputTokens') AS INTEGER), 0)) + ?),
    '$.localModelTokenUsage.outputTokens', MIN(4503599627370495, MAX(0, COALESCE(CAST(json_extract(value, '$.localModelTokenUsage.outputTokens') AS INTEGER), 0)) + ?),`
    : "";
  return `INSERT INTO settings (id, value) VALUES (?, ?)
  ON CONFLICT (id) DO UPDATE SET value = json_set(
    CASE WHEN json_type(value, '$.localModelTokenUsage.totalCommands') = 'integer'
      OR (COALESCE(json_extract(value, '$.localModelTokenUsage.inputTokens'), 0) = 0
        AND COALESCE(json_extract(value, '$.localModelTokenUsage.outputTokens'), 0) = 0)
    THEN json_set(value, '$.localModelTokenUsage.totalCommands', MIN(9007199254740991, MAX(0, COALESCE(CAST(json_extract(value, '$.localModelTokenUsage.totalCommands') AS INTEGER), 0)) + 1))
    ELSE value END,
    ${savedTokenUpdates}
    '$.localModelTokenUsage.allInputTokens', MIN(4503599627370495, MAX(0, COALESCE(CAST(json_extract(value, '$.localModelTokenUsage.allInputTokens') AS INTEGER), CAST(json_extract(value, '$.localModelTokenUsage.inputTokens') AS INTEGER), 0)) + ?),
    '$.localModelTokenUsage.allOutputTokens', MIN(4503599627370495, MAX(0, COALESCE(CAST(json_extract(value, '$.localModelTokenUsage.allOutputTokens') AS INTEGER), CAST(json_extract(value, '$.localModelTokenUsage.outputTokens') AS INTEGER), 0)) + ?))`;
};

const materializeUsage = (value: LocalTokenUsage, source: "local" | "cloud") => {
  const usage = normalizeLocalTokenUsage(value);
  if (!usage || usage.inputTokens + usage.outputTokens === 0) return [];
  const local = source === "local";
  return {
    sql: incrementSql(local),
    bindValues: [
      "user-settings",
      JSON.stringify({
        ...defaultSettings,
        localModelTokenUsage: {
          inputTokens: local ? usage.inputTokens : 0,
          outputTokens: local ? usage.outputTokens : 0,
          allInputTokens: usage.inputTokens,
          allOutputTokens: usage.outputTokens,
          totalCommands: 1,
        },
      }),
      ...(local ? [usage.inputTokens, usage.outputTokens] : []),
      usage.inputTokens,
      usage.outputTokens,
    ],
    writeTables: new Set(["settings"]),
  };
};

export const localModelUsageMaterializers = {
  "v1.LocalModelUsageRecorded": (value: LocalTokenUsage) => {
    return materializeUsage(value, "local");
  },
  "v1.CloudModelUsageRecorded": (value: LocalTokenUsage) => materializeUsage(value, "cloud"),
};
