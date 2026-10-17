import { Events, Schema, State, queryDb } from "@livestore/livestore";

export type SemanticSearchMode = "hybrid" | "bm25" | "bge";
import { modelRoutingSchema, type StoredModelRouting } from "@/lib/models/modelRoutingSchema";
import type { LocalModelUsageTotals } from "@/lib/models/localTokenUsage";
import {
  DEFAULT_PERMISSION_MODE,
  type PermissionGrant,
  type PermissionMode,
} from "@/lib/chat/permissions";

const permissionModeSchema = Schema.Struct({
  guard: Schema.Literal("writes", "reads-and-writes"),
  approver: Schema.Literal("user", "auto"),
});

const permissionGrantSchema = Schema.Struct({
  id: Schema.String,
  access: Schema.Literal("read", "write"),
  target: Schema.Union(
    Schema.Struct({ kind: Schema.Literal("file"), fileId: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("folder"), folderId: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("library") }),
    Schema.Struct({ kind: Schema.Literal("path-prefix"), prefix: Schema.String }),
  ),
  createdAt: Schema.Number,
});

export interface setting {
  webMcpEnabled?: boolean;
  webMcpReadEnabled?: boolean;
  webMcpWriteEnabled?: boolean;
  agentDeliveryMode?: "pending" | "steer";
  /** The default for new chats; a chat can override it. */
  permissionMode?: PermissionMode;
  permissionGrants?: readonly PermissionGrant[];
  modelRouting?: StoredModelRouting;
  localModelTokenUsage?: LocalModelUsageTotals;
  theme: "light" | "dark" | "system";
  language: string;
  defaultTranscriptionModel: string;
  defaultSummarizationModel: string;
  autoTranscribe: boolean;
  autoIndex: boolean;
  semanticSearchMode: SemanticSearchMode;
  semanticSearchEnabled?: boolean;
  sidebarCollapsed: boolean;
  selectedProviderId: string;
  selectedModel: string;
  defaultNoteLocationMode: "root" | "folder";
  defaultNoteFolderId: string;
  attachmentPlacementMode: "root" | "fixed-folder" | "current-folder" | "current-subfolder";
  attachmentFolderId: string;
  attachmentSubfolderName: string;
  editorFontSizePx: number;
  onboardingName?: string;
  onboardingCompleted?: boolean;
  onboardingSkippedAt?: string;
  primaryUseCase?: string;
  assistantStyle?: string;
  customInstructions?: string;
  homeGridSeeded?: boolean;
  widgetFoldersSeeded?: boolean;
  logCollectionEnabled?: boolean;
}

export const defaultSettings: setting = {
  webMcpEnabled: false,
  webMcpReadEnabled: true,
  webMcpWriteEnabled: false,
  agentDeliveryMode: "pending",
  permissionMode: DEFAULT_PERMISSION_MODE,
  permissionGrants: [],
  modelRouting: {},
  localModelTokenUsage: {
    inputTokens: 0,
    outputTokens: 0,
    allInputTokens: 0,
    allOutputTokens: 0,
    totalCommands: 0,
  },
  theme: "system",
  language: "en-US",
  defaultTranscriptionModel: "whisper-small",
  defaultSummarizationModel: "",
  autoTranscribe: true,
  autoIndex: true,
  semanticSearchMode: "bm25",
  semanticSearchEnabled: false,
  sidebarCollapsed: false,
  selectedProviderId: "",
  selectedModel: "",
  defaultNoteLocationMode: "root",
  defaultNoteFolderId: "",
  attachmentPlacementMode: "current-subfolder",
  attachmentFolderId: "",
  attachmentSubfolderName: "images",
  editorFontSizePx: 16,
  onboardingName: "",
  onboardingCompleted: false,
  onboardingSkippedAt: "",
  primaryUseCase: "",
  assistantStyle: "",
  customInstructions: "",
  homeGridSeeded: false,
  widgetFoldersSeeded: false,
  logCollectionEnabled: false,
};

export const settingsStoredValueSchema = Schema.Struct({
  webMcpEnabled: Schema.optional(Schema.Boolean),
  webMcpReadEnabled: Schema.optional(Schema.Boolean),
  webMcpWriteEnabled: Schema.optional(Schema.Boolean),
  agentDeliveryMode: Schema.optional(Schema.Literal("pending", "steer")),
  permissionMode: Schema.optional(permissionModeSchema),
  permissionGrants: Schema.optional(Schema.Array(permissionGrantSchema)),
  modelRouting: Schema.optional(modelRoutingSchema),
  localModelTokenUsage: Schema.optional(
    Schema.Struct({
      inputTokens: Schema.Number,
      outputTokens: Schema.Number,
      allInputTokens: Schema.optional(Schema.Number),
      allOutputTokens: Schema.optional(Schema.Number),
      totalCommands: Schema.optional(Schema.Number),
    }),
  ),
  theme: Schema.optional(Schema.Literal("light", "dark", "system")),
  language: Schema.optional(Schema.String),
  defaultTranscriptionModel: Schema.optional(Schema.String),
  defaultSummarizationModel: Schema.optional(Schema.String),
  autoTranscribe: Schema.optional(Schema.Boolean),
  autoIndex: Schema.optional(Schema.Boolean),
  semanticSearchMode: Schema.optional(Schema.Literal("hybrid", "bm25", "bge")),
  semanticSearchEnabled: Schema.optional(Schema.Boolean),
  sidebarCollapsed: Schema.optional(Schema.Boolean),
  selectedProviderId: Schema.optional(Schema.String),
  selectedModel: Schema.optional(Schema.String),
  defaultNoteLocationMode: Schema.optional(Schema.Literal("root", "folder")),
  defaultNoteFolderId: Schema.optional(Schema.String),
  attachmentPlacementMode: Schema.optional(
    Schema.Literal("root", "fixed-folder", "current-folder", "current-subfolder"),
  ),
  attachmentFolderId: Schema.optional(Schema.String),
  attachmentSubfolderName: Schema.optional(Schema.String),
  editorFontSizePx: Schema.optional(Schema.Number),
  onboardingName: Schema.optional(Schema.String),
  onboardingCompleted: Schema.optional(Schema.Boolean),
  onboardingSkippedAt: Schema.optional(Schema.String),
  primaryUseCase: Schema.optional(Schema.String),
  assistantStyle: Schema.optional(Schema.String),
  customInstructions: Schema.optional(Schema.String),
  homeGridSeeded: Schema.optional(Schema.Boolean),
  widgetFoldersSeeded: Schema.optional(Schema.Boolean),
  logCollectionEnabled: Schema.optional(Schema.Boolean),
});

export const normalizeSettingsValue = (value: Partial<setting> | null | undefined): setting => {
  const legacySemanticMode =
    value?.semanticSearchMode === undefined && value?.semanticSearchEnabled === false
      ? "bm25"
      : undefined;
  return {
    ...defaultSettings,
    ...value,
    ...(legacySemanticMode ? { semanticSearchMode: legacySemanticMode } : {}),
  };
};

/**
 * This device's settings document. It still holds the fields in `DEVICE_SETTING_KEYS`, and values
 * written before settings synced, which `migrateSettingsToSync` copies over once.
 */
export const settingsTable = State.SQLite.clientDocument({
  name: "settings",
  schema: settingsStoredValueSchema,
  default: {
    id: "user-settings",
    value: defaultSettings,
  },
});

type StoredSettings = typeof settingsStoredValueSchema.Type;

/** Fields that describe this device rather than the person. They never sync. */
const DEVICE_SETTING_KEYS: ReadonlySet<string> = new Set([
  "webMcpEnabled",
  "webMcpReadEnabled",
  "webMcpWriteEnabled",
  "sidebarCollapsed",
  "logCollectionEnabled",
  "localModelTokenUsage",
]);

/** One row per setting, so two devices changing different settings both keep their change. */
export const syncedSettingsTable = State.SQLite.table({
  name: "synced_settings",
  columns: {
    key: State.SQLite.text({ primaryKey: true }),
    /** JSON-encoded value. */
    value: State.SQLite.text(),
  },
});

const settingsUpdated = Events.synced({
  name: "v1.SettingsUpdated",
  schema: Schema.Struct({ value: settingsStoredValueSchema }),
});

const syncedEntries = (value: Partial<StoredSettings>): [string, unknown][] =>
  Object.entries(value).filter(
    ([key, item]) => item !== undefined && !DEVICE_SETTING_KEYS.has(key),
  );

/** Event definitions for the schema. */
export const settingEventDefs = {
  settingsSet: settingsTable.set,
  settingsUpdated,
};

export const settingEvents = {
  /**
   * Changes this person's settings on every device. Fields in `DEVICE_SETTING_KEYS` are left
   * out; change those with `deviceSettingsSet`.
   */
  settingsSet: (value: Partial<StoredSettings>) =>
    settingsUpdated({ value: Object.fromEntries(syncedEntries(value)) as StoredSettings }),
  /** Changes settings on this device only. */
  deviceSettingsSet: (value: Partial<StoredSettings>) => settingsTable.set(value),
};

export const settingMaterializers = {
  "v1.SettingsUpdated": ({ value }: { value: StoredSettings }) =>
    syncedEntries(value).map(([key, item]) =>
      syncedSettingsTable.insert({ key, value: JSON.stringify(item) }).onConflict("key", "replace"),
    ),
};

export const deviceSettingsQuery$ = queryDb(() => settingsTable.get("user-settings"), {
  label: "settings:device",
});

export const syncedSettingsQuery$ = queryDb(() => syncedSettingsTable.select(), {
  label: "settings:synced",
});

/** Synced values win over this device's document, except for device-only fields. */
export const mergeSettings = (
  device: StoredSettings,
  rows: readonly { key: string; value: string }[],
): StoredSettings => {
  const synced: Record<string, unknown> = {};
  for (const row of rows) {
    if (DEVICE_SETTING_KEYS.has(row.key)) continue;
    try {
      synced[row.key] = JSON.parse(row.value);
    } catch {
      // A malformed row keeps the device value.
    }
  }
  return { ...device, ...synced } as StoredSettings;
};

/**
 * Settings saved on this device before they synced, which no device has synced yet. Values equal
 * to the defaults are skipped so a fresh device does not overwrite another device's choices.
 */
export const settingsToMigrate = (
  device: StoredSettings,
  syncedKeys: ReadonlySet<string>,
): Partial<StoredSettings> => {
  const defaults: Record<string, unknown> = { ...defaultSettings };
  return Object.fromEntries(
    syncedEntries(device).filter(
      ([key, item]) =>
        !syncedKeys.has(key) && JSON.stringify(item) !== JSON.stringify(defaults[key]),
    ),
  ) as Partial<StoredSettings>;
};

/** Copies settings saved before sync into the synced table. Safe to run on every start. */
export const migrateSettingsToSync = (store: {
  query: {
    (query: typeof deviceSettingsQuery$): StoredSettings;
    (query: typeof syncedSettingsQuery$): readonly { key: string }[];
  };
  commit: (event: ReturnType<typeof settingsUpdated>) => void;
}): void => {
  const device = store.query(deviceSettingsQuery$);
  const syncedKeys = new Set(store.query(syncedSettingsQuery$).map((row) => row.key));
  const pending = settingsToMigrate(device, syncedKeys);
  if (Object.keys(pending).length > 0) store.commit(settingEvents.settingsSet(pending));
};
