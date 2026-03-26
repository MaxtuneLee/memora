import { CheckCircleIcon, FileTextIcon, PenNibIcon, SparkleIcon } from "@phosphor-icons/react";
import type { PromptSegment } from "@memora/ai-core";
import type { file as LiveStoreFile } from "@/livestore/file";
import type { folder as LiveStoreFolder } from "@/livestore/folder";
import type { ChatMessage as AgentChatMessage } from "@/hooks/chat/useAgent";
import {
  getChatMessagePreviewText,
  type ChatImageAttachment,
} from "@/lib/chat/chatImageAttachments";
import { EMPTY_REFERENCE_SCOPE, type ResolvedReferenceScope } from "@/lib/chat/tools";
import {
  type ChatSessionMessage,
  type ChatSessionRecord,
  type ChatSessionReference,
  type ChatSessionSummary,
} from "@/lib/chat/chatSessionStorage";
import { loadGlobalMemoryData, loadPersonalityDoc } from "@/lib/settings/personalityStorage";
import type { SuggestionCard } from "./types";

export const suggestions: SuggestionCard[] = [
  {
    icon: SparkleIcon,
    title: "Summarize a file",
    description: "Get a quick summary of any uploaded file",
  },
  {
    icon: PenNibIcon,
    title: "Draft a note",
    description: "Write notes from your recordings",
  },
  {
    icon: FileTextIcon,
    title: "Search transcripts",
    description: "Find specific moments in your audio",
  },
  {
    icon: CheckCircleIcon,
    title: "Create action items",
    description: "Extract tasks from your meetings",
  },
];

export const IS_DEV = import.meta.env.DEV;
export const MAX_REFERENCED_FILES = 200;
export const REFERENCE_MENTION_PATTERN = /@([^\s@]*)$/;

export const toAgentMessages = (messages: ChatSessionMessage[]): AgentChatMessage[] => {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    attachments: message.attachments,
    widgets: message.widgets,
    thinkingSteps: message.thinkingSteps,
    usage: message.usage,
  }));
};

export const toSessionSummary = (record: ChatSessionRecord): ChatSessionSummary => {
  const lastMessage = [...record.messages]
    .reverse()
    .find((message) => getChatMessagePreviewText(message).length > 0);
  return {
    id: record.id,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messageCount: record.messages.length,
    preview: lastMessage ? getChatMessagePreviewText(lastMessage) : "",
  };
};

export const buildReferenceKey = (reference: ChatSessionReference): string => {
  return `${reference.type}:${reference.id}`;
};

export const sanitizeActiveReferences = (
  references: ChatSessionReference[],
  fileById: Map<string, LiveStoreFile>,
  folderById: Map<string, LiveStoreFolder>,
): ChatSessionReference[] => {
  const seen = new Set<string>();
  const next: ChatSessionReference[] = [];

  for (const reference of references) {
    const exists =
      reference.type === "file" ? fileById.has(reference.id) : folderById.has(reference.id);
    if (!exists) continue;
    const key = buildReferenceKey(reference);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(reference);
  }

  return next;
};

export const removeTrailingReferenceMention = (value: string): string => {
  return value.replace(REFERENCE_MENTION_PATTERN, "").replace(/\s+$/, "");
};

export const resolveReferenceScope = (
  references: ChatSessionReference[],
  files: readonly LiveStoreFile[],
  folders: readonly LiveStoreFolder[],
): ResolvedReferenceScope => {
  const fileById = new Map(files.map((file) => [file.id, file]));
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const validReferences = sanitizeActiveReferences(references, fileById, folderById);

  if (validReferences.length === 0) {
    return EMPTY_REFERENCE_SCOPE;
  }

  const filesByParent = new Map<string | null, LiveStoreFile[]>();
  for (const file of files) {
    const parentKey = file.parentId ?? null;
    const siblings = filesByParent.get(parentKey) ?? [];
    siblings.push(file);
    filesByParent.set(parentKey, siblings);
  }

  const foldersByParent = new Map<string | null, LiveStoreFolder[]>();
  for (const folder of folders) {
    const parentKey = folder.parentId ?? null;
    const siblings = foldersByParent.get(parentKey) ?? [];
    siblings.push(folder);
    foldersByParent.set(parentKey, siblings);
  }

  const selectedFileIds = new Set<string>();
  for (const reference of validReferences) {
    if (reference.type === "file") {
      selectedFileIds.add(reference.id);
      continue;
    }

    const queue: string[] = [reference.id];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId || visited.has(currentId)) continue;
      visited.add(currentId);

      const childFiles = filesByParent.get(currentId) ?? [];
      childFiles.forEach((file) => selectedFileIds.add(file.id));

      const childFolders = foldersByParent.get(currentId) ?? [];
      childFolders.forEach((folder) => {
        if (!visited.has(folder.id)) {
          queue.push(folder.id);
        }
      });
    }
  }

  const allResolvedIds = Array.from(selectedFileIds);
  const truncated = allResolvedIds.length > MAX_REFERENCED_FILES;
  const scopedIds = truncated ? allResolvedIds.slice(0, MAX_REFERENCED_FILES) : allResolvedIds;
  const allowedPathsSet = new Set<string>();

  for (const id of scopedIds) {
    const file = fileById.get(id);
    if (!file) continue;
    if (typeof file.storagePath === "string" && file.storagePath.length > 0) {
      allowedPathsSet.add(file.storagePath);
    }
    if (typeof file.transcriptPath === "string" && file.transcriptPath.length > 0) {
      allowedPathsSet.add(file.transcriptPath);
    }
  }

  return {
    isActive: true,
    fileIds: scopedIds,
    allowedPaths: Array.from(allowedPathsSet),
    referenceLabels: validReferences.map((reference) =>
      reference.type === "folder" ? `Folder "${reference.name}"` : `File "${reference.name}"`,
    ),
    totalResolvedFiles: allResolvedIds.length,
    truncated,
  };
};

export const buildReferenceScopePrompt = (scope: ResolvedReferenceScope): string => {
  if (!scope.isActive) {
    return "";
  }

  const previewLabels = scope.referenceLabels.slice(0, 8);
  const hasMoreLabels = scope.referenceLabels.length > previewLabels.length;
  const resolvedCountText = scope.truncated
    ? `${scope.fileIds.length} (trimmed from ${scope.totalResolvedFiles})`
    : `${scope.fileIds.length}`;
  const truncationNote = scope.truncated
    ? `Only the first ${MAX_REFERENCED_FILES} resolved files are in scope for this turn.`
    : "";
  const emptyScopeNote =
    scope.fileIds.length === 0 ? "No active files were resolved from the current references." : "";

  return `## Active Reference Scope
The user has selected session-level file or folder references. Treat this scope as a hard constraint when using file-related tools.
- References: ${previewLabels.join(", ")}${hasMoreLabels ? ", ..." : ""}
- Scoped file count: ${resolvedCountText}
${truncationNote}
${emptyScopeNote}
When the scope is active, do not search or read files outside this reference scope.`;
};

export const createReferenceScopePromptSegment = (
  getScope: () => ResolvedReferenceScope,
): PromptSegment => {
  return {
    id: "reference-scope",
    priority: 90,
    content: () => buildReferenceScopePrompt(getScope()),
  };
};

export const buildSessionSignature = (
  messages: AgentChatMessage[],
  references: ChatSessionReference[],
): string => {
  return JSON.stringify({
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      attachments: message.attachments ?? [],
      widgets: message.widgets ?? [],
      thinkingSteps: message.thinkingSteps ?? [],
      ...(message.usage ? { usage: message.usage } : {}),
    })),
    references: references.map((reference) => ({
      type: reference.type,
      id: reference.id,
      name: reference.name,
    })),
  });
};

export const findMessageIndexById = (messages: AgentChatMessage[], messageId: string): number => {
  return messages.findIndex((message) => message.id === messageId);
};

export const findRetrySourceMessage = (
  messages: AgentChatMessage[],
  assistantMessageId: string,
): AgentChatMessage | null => {
  const assistantIndex = findMessageIndexById(messages, assistantMessageId);
  if (assistantIndex <= 0) {
    return null;
  }

  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate?.role === "user") {
      return candidate;
    }
  }

  return null;
};

export const hasImageItems = (dataTransfer: DataTransfer | null): boolean => {
  if (!dataTransfer) {
    return false;
  }

  return Array.from(dataTransfer.items).some((item) => {
    return item.kind === "file" && item.type.startsWith("image/");
  });
};

export const resolveTimeGreeting = (date: Date): string => {
  const hour = date.getHours();
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
};

export const resolveGreetingName = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return null;
  }

  return normalized;
};

export const extractNameFromPersonalityMarkdown = (markdown: string): string | null => {
  const match = markdown.match(/^##\s+User\s+Identity\s*\n([\s\S]*?)(?=\n##\s+|$)/im);
  if (!match) {
    return null;
  }

  const firstLine = match[1]
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return null;
  }

  if (/^not\s+specified$/i.test(firstLine)) {
    return null;
  }

  return resolveGreetingName(firstLine);
};

export const loadGreetingName = async (): Promise<string | null> => {
  const globalMemory = await loadGlobalMemoryData();
  const fromGlobalMemory = extractNameFromPersonalityMarkdown(globalMemory?.personality ?? "");
  if (fromGlobalMemory) {
    return fromGlobalMemory;
  }

  const personalityDoc = await loadPersonalityDoc();
  return extractNameFromPersonalityMarkdown(personalityDoc ?? "");
};

export const hasAttachmentImages = (attachments: ChatImageAttachment[]): boolean => {
  return attachments.length > 0;
};
