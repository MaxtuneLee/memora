/** Groups the settings navigation. A group without a label shows its items on their own. */
export const SETTINGS_GROUPS = [
  { id: "general", label: null },
  { id: "assistant", label: "Assistant" },
  { id: "models", label: "Models" },
  { id: "privacy", label: "Privacy and security" },
  { id: "data", label: "Data" },
  { id: "about", label: null },
] as const;

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]["id"];

export const SETTINGS_SECTIONS = [
  {
    id: "general",
    group: "general",
    label: "General",
    description: "Profile, workspace, and appearance settings.",
  },
  {
    id: "memory",
    group: "assistant",
    label: "Personalization",
    description: "Set how Memora addresses and responds to you, and manage its saved memory.",
  },
  {
    id: "skills",
    group: "assistant",
    label: "Skills",
    description:
      "Skills are tools that the assistant can use to access information and perform extended actions. We do not support third-party skills yet, but you can review the built-in skills here.",
  },
  {
    id: "ai-provider",
    group: "models",
    label: "Providers",
    description: "Manage cloud endpoints. API keys will only stay on this device.",
  },
  {
    id: "model-routing",
    group: "models",
    label: "Models by feature",
    description: "Choose where each feature runs on this device. Chat always uses a cloud model.",
  },
  {
    id: "local-models",
    group: "models",
    label: "Local models",
    description: "Review downloaded browser models and cache status.",
  },
  {
    id: "permissions",
    group: "privacy",
    label: "Permissions",
    description: "Choose which file access chat asks about, and who approves it.",
  },
  {
    id: "security",
    group: "privacy",
    label: "Security",
    description: "Lock Memora with a passkey and choose how your API keys are encrypted.",
  },
  {
    id: "indexing",
    group: "data",
    label: "Indexing",
    description: "Background extraction, OCR, and local search behavior.",
  },
  {
    id: "data-storage",
    group: "data",
    label: "Data storage",
    description: "Storage usage and persistence options.",
  },
  {
    id: "about",
    group: "about",
    label: "About",
    description: "Version, build, and support information.",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  group: SettingsGroupId;
  label: string;
  description: string;
}>;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];
