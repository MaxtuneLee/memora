import { Schema, State } from "@livestore/livestore";

export const settingsTable = State.SQLite.clientDocument({
  name: "settings",
  schema: Schema.Struct({
    theme: Schema.Literal("light", "dark", "system"),
    language: Schema.String,
    defaultTranscriptionModel: Schema.String,
    defaultSummarizationModel: Schema.String,
    autoTranscribe: Schema.Boolean,
    autoIndex: Schema.Boolean,
    sidebarCollapsed: Schema.Boolean,
    selectedProviderId: Schema.String,
    selectedModel: Schema.String,
    onboardingName: Schema.optional(Schema.String),
    onboardingCompleted: Schema.optional(Schema.Boolean),
    onboardingSkippedAt: Schema.optional(Schema.String),
  }),
  default: {
    id: "user-settings",
    value: {
      theme: "system",
      language: "en-US",
      defaultTranscriptionModel: "whisper-small",
      defaultSummarizationModel: "",
      autoTranscribe: true,
      autoIndex: true,
      sidebarCollapsed: false,
      selectedProviderId: "",
      selectedModel: "",
      onboardingName: "",
      onboardingCompleted: false,
      onboardingSkippedAt: "",
    },
  },
});

export const settingEvents = {
  settingsSet: settingsTable.set,
};
