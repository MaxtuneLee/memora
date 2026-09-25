import { Schema, State } from "@livestore/livestore";

export type SemanticSearchMode = "hybrid" | "bm25" | "bge";
import { modelRoutingSchema, type StoredModelRouting } from "@/lib/models/modelRoutingSchema";
import type { LocalModelUsageTotals } from "@/lib/models/localTokenUsage";

export interface setting {
  agentDeliveryMode?: "pending" | "steer";
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
  agentDeliveryMode: "pending",
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
  agentDeliveryMode: Schema.optional(Schema.Literal("pending", "steer")),
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

export const settingsTable = State.SQLite.clientDocument({
  name: "settings",
  schema: settingsStoredValueSchema,
  default: {
    id: "user-settings",
    value: defaultSettings,
  },
});

export const settingEvents = {
  settingsSet: settingsTable.set,
};
