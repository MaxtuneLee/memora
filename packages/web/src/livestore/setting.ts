import { Schema, State } from "@livestore/livestore";

export interface setting {
  theme: "light" | "dark" | "system";
  language: string;
  defaultTranscriptionModel: string;
  defaultSummarizationModel: string;
  autoTranscribe: boolean;
  autoIndex: boolean;
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
}

export const defaultSettings: setting = {
  theme: "system",
  language: "en-US",
  defaultTranscriptionModel: "whisper-small",
  defaultSummarizationModel: "",
  autoTranscribe: true,
  autoIndex: true,
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
};

export const settingsStoredValueSchema = Schema.Struct({
  theme: Schema.optional(Schema.Literal("light", "dark", "system")),
  language: Schema.optional(Schema.String),
  defaultTranscriptionModel: Schema.optional(Schema.String),
  defaultSummarizationModel: Schema.optional(Schema.String),
  autoTranscribe: Schema.optional(Schema.Boolean),
  autoIndex: Schema.optional(Schema.Boolean),
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
});

export const normalizeSettingsValue = (value: Partial<setting> | null | undefined): setting => {
  return {
    ...defaultSettings,
    ...value,
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
