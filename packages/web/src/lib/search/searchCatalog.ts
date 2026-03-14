import { SETTINGS_SECTIONS } from "@/types/settings";
import type { GlobalSearchItem } from "@/types/search";

export const PAGE_SEARCH_ITEMS: GlobalSearchItem[] = [
  {
    id: "page:home",
    kind: "page",
    title: "Home",
    description: "Desktop workspace and file surface",
    preview: "Open the Memora desktop with files, folders, previews, and widgets.",
    keywords: ["desktop", "workspace", "home page", "root"],
    intent: {
      type: "navigate",
      to: "/",
    },
  },
  {
    id: "page:transcription",
    kind: "page",
    title: "Transcription",
    description: "Transcript history and live capture tools",
    preview: "Browse transcript history or jump into a live transcription session.",
    keywords: ["transcript", "speech", "recording", "audio", "history"],
    intent: {
      type: "navigate",
      to: "/transcript",
    },
  },
  {
    id: "page:chat",
    kind: "page",
    title: "Chat",
    description: "Assistant conversations and saved sessions",
    preview: "Open the assistant workspace with saved chat sessions and references.",
    keywords: ["assistant", "conversation", "messages", "session"],
    intent: {
      type: "navigate",
      to: "/chat",
    },
  },
  {
    id: "page:files",
    kind: "page",
    title: "Files",
    description: "Workspace file library",
    preview: "Review all stored files in a single library view.",
    keywords: ["library", "documents", "media", "assets"],
    intent: {
      type: "navigate",
      to: "/files",
    },
  },
];

export const ACTION_SEARCH_ITEMS: GlobalSearchItem[] = [
  {
    id: "action:new-chat",
    kind: "action",
    title: "New chat session",
    description: "Assistant workflow",
    preview: "Create a fresh chat session and move the conversation to a blank thread.",
    keywords: ["new chat", "new conversation", "assistant", "thread", "start"],
    intent: {
      type: "navigate",
      to: "/chat?new=1",
    },
  },
  {
    id: "action:start-live-transcription",
    kind: "action",
    title: "Start live transcription",
    description: "Transcription workflow",
    preview: "Open the live transcription recorder and begin a new capture session.",
    keywords: ["record", "live", "speech to text", "capture", "microphone"],
    intent: {
      type: "navigate",
      to: "/transcript/live",
    },
  },
  {
    id: "action:upload-file",
    kind: "action",
    title: "Upload file",
    description: "Desktop workflow",
    preview: "Jump to Home and open the existing file upload picker.",
    keywords: ["import", "add file", "attach", "desktop", "upload"],
    intent: {
      type: "desktop-intent",
      to: "/",
      desktopIntent: {
        type: "uploadFile",
        parentId: null,
      },
    },
  },
  {
    id: "action:new-folder",
    kind: "action",
    title: "New folder",
    description: "Desktop workflow",
    preview: "Jump to Home and create a folder on the desktop surface.",
    keywords: ["create folder", "desktop", "organize", "new directory"],
    intent: {
      type: "desktop-intent",
      to: "/",
      desktopIntent: {
        type: "newFolder",
        parentId: null,
      },
    },
  },
  {
    id: "action:open-trash",
    kind: "action",
    title: "Open trash",
    description: "Desktop workflow",
    preview: "Jump to Home and open the trash window for deleted files and folders.",
    keywords: ["bin", "deleted files", "restore", "desktop", "trash"],
    intent: {
      type: "desktop-intent",
      to: "/",
      desktopIntent: {
        type: "openTrash",
      },
    },
  },
];

export const SETTINGS_SEARCH_ITEMS: GlobalSearchItem[] = SETTINGS_SECTIONS.map(
  (section) => ({
    id: `settings:${section.id}`,
    kind: "settings",
    title: section.label,
    description: section.description,
    preview: `Open Settings > ${section.label}.`,
    keywords: [
      section.id,
      "settings",
      "preferences",
      section.label,
      ...section.description.split(/\s+/u),
    ],
    intent: {
      type: "open-settings",
      section: section.id,
    },
  }),
);

export const STATIC_SEARCH_ITEMS: GlobalSearchItem[] = [
  ...PAGE_SEARCH_ITEMS,
  ...ACTION_SEARCH_ITEMS,
  ...SETTINGS_SEARCH_ITEMS,
];
