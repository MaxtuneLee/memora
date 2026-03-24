import type { ShowWidgetSkillTracker } from "@/lib/chat/showWidget";

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
  operation: "write" | "append";
  content: string;
  contentLength: number;
  overwrite: boolean;
}

export interface CreateChatToolsOptions {
  getReferenceScope?: () => ResolvedReferenceScope;
  showWidgetSkillTracker?: ShowWidgetSkillTracker;
  getMemoryExtractionConfig?: () => {
    apiFormat: "chat-completions" | "responses";
    endpoint: string;
    apiKey: string;
    model: string;
  } | null;
  onMemoryUpdated?: () => void;
  requestWriteApproval?: (
    request: WriteApprovalRequest,
  ) => Promise<WriteApprovalDecision> | WriteApprovalDecision;
}

// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export type StoreQueryable = { query: (...args: any[]) => any };

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
