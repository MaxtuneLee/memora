import type { ChatSessionRecord, ChatSessionSummary } from "@/lib/chat/chatSessionStorage";
import type { ShowWidgetSkillTracker } from "@/lib/chat/showWidget";
import type { MemoryNoticeChanges } from "@/lib/settings/personalityStorage";
import type { PiModelRuntime } from "@memora/ai-provider-pi";

export interface ResolvedReferenceScope {
  isActive: boolean;
  fileIds: string[];
  allowedPaths: string[];
  referenceLabels: string[];
  totalResolvedFiles: number;
  truncated: boolean;
}

export const EMPTY_REFERENCE_SCOPE: ResolvedReferenceScope = {
  isActive: false,
  fileIds: [],
  allowedPaths: [],
  referenceLabels: [],
  totalResolvedFiles: 0,
  truncated: false,
};

export type WriteApprovalDecision = "allow_once" | "allow_session" | "deny";

export interface WriteApprovalRequest {
  path: string;
  operation: "create" | "write" | "append" | "replace";
  content: string;
  contentLength: number;
  overwrite: boolean;
  /** The changes, for "replace". */
  edits?: { oldText: string; newText: string }[];
}

export interface CreateChatToolsOptions {
  getReferenceScope?: () => ResolvedReferenceScope;
  showWidgetSkillTracker?: ShowWidgetSkillTracker;
  getMemoryExtractionRuntime?: () => PiModelRuntime | null;
  onMemoryUpdated?: () => void;
  /** The notices the preference tool reads and changes; the user's global memory when absent. */
  memoryNotices?: {
    list: () => Promise<Array<{ id: string; text: string }>>;
    apply: (changes: MemoryNoticeChanges) => Promise<{ updated: boolean; noticeCount: number }>;
  };
  /** The chats the session tools can see; the user's stored chats when absent. */
  chatSessions?: {
    list: () => Promise<ChatSessionSummary[]>;
    load: (sessionId: string) => Promise<ChatSessionRecord | null>;
  };
  requestWriteApproval?: (
    request: WriteApprovalRequest,
  ) => Promise<WriteApprovalDecision> | WriteApprovalDecision;
}

// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export type StoreQueryable = {
  query: (...args: any[]) => any;
  /** Needed by tools that add or update library files. */
  commit?: (...events: any[]) => void;
};

export interface ActiveFileRow {
  id: string;
  name: string;
  type: "audio" | "video" | "image" | "document";
  transcriptPath: string | null;
}

export interface TranscriptWord {
  text: string;
  timestamp: [number, number];
}

export interface TranscriptWordRange extends TranscriptWord {
  start: number;
  end: number;
}
