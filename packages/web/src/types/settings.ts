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
    id: "ai-provider",
    label: "AI Service Provider",
    description: "Manage AI runtime and model endpoints.",
  },
  {
    id: "memory",
    label: "Memory",
    description: "Review and manage the assistant's saved long-term memory.",
  },
  {
    id: "skills",
    label: "Skills",
    description: "Inspect built-in skills bundled with the app.",
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
