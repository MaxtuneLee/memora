export const SETTINGS_SECTIONS = [
  {
    id: "general",
    label: "General",
    description: "Profile, workspace, and appearance settings.",
  },
  {
    id: "hotkeys",
    label: "Hotkeys",
    description: "Shortcuts and command palette preferences.",
  },
  {
    id: "model-routing",
    label: "Models by feature",
    description: "Choose where each feature runs on this device. Chat always uses a cloud model.",
  },
  {
    id: "ai-provider",
    label: "Providers",
    description:
      "Manage cloud endpoints. API keys stay on this device and are never synced or exported.",
  },
  {
    id: "local-models",
    label: "Local Models",
    description: "Review downloaded browser models and cache status.",
  },
  {
    id: "memory",
    label: "Memory",
    description: "Review and manage the assistant's saved long-term memory.",
  },
  {
    id: "indexing",
    label: "Indexing",
    description: "Background extraction, OCR, and local search behavior.",
  },
  {
    id: "skills",
    label: "Skills",
    description:
      "Skills are tools that the assistant can use to access information and perform extended actions. We do not support third-party skills yet, but you can review the built-in skills here.",
  },
  {
    id: "data-storage",
    label: "Data Storage",
    description: "Storage usage and persistence options.",
  },
  {
    id: "about",
    label: "About",
    description: "Version, build, and support information.",
  },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];
