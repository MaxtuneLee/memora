import type { ChatSessionRecord, ChatSessionSummary } from "@/lib/chat/chatSessionStorage";
import type { ShowWidgetSkillTracker } from "@/lib/chat/showWidget";
import type { PiModelRuntime } from "@memora/ai-provider-pi";
import type { ToolDefinition } from "@memora/ai-core";
import type { TranscriptWord } from "@/types/library";

import { desktopFilesQuery$, desktopFoldersQuery$ } from "@/lib/desktop/queries";
import {
  DEFAULT_PERMISSION_MODE,
  type AccessAnswer,
  type AccessFile,
  type AccessRequest,
  type AccessResult,
  type PermissionGrant,
  type PermissionMode,
} from "@/lib/chat/permissions";
import type { DocumentToolTarget } from "./documentTools";

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

export interface CreateChatToolsOptions {
  getReferenceScope?: () => ResolvedReferenceScope;
  showWidgetSkillTracker?: ShowWidgetSkillTracker;
  getMemoryExtractionRuntime?: () => PiModelRuntime | null;
  onMemoryUpdated?: () => void;
  /** Where extracted notices go; the user's global memory when absent. */
  saveMemoryNotices?: (notices: string[]) => Promise<{ updated: boolean; noticeCount: number }>;
  /** The chats the session tools can see; the user's stored chats when absent. */
  chatSessions?: {
    list: () => Promise<ChatSessionSummary[]>;
    load: (sessionId: string) => Promise<ChatSessionRecord | null>;
  };
  /** Adds read_document, edit_document, and write_document for the note open next to the chat. */
  documentTarget?: DocumentToolTarget;
  /** The Permission mode in effect; the default from Settings when absent. */
  getPermissionMode?: () => PermissionMode;
  /** Saved Permission grants; the ones in Settings when absent. */
  getPermissionGrants?: () => readonly PermissionGrant[];
  /** Saves "always" choices; into Settings when absent. */
  addPermissionGrants?: (grants: PermissionGrant[]) => void;
  /**
   * The approver; a dialog in this tab when absent. Null means no approver: guarded reads and
   * all writes are refused.
   */
  requestAccess?: ((request: AccessRequest) => Promise<AccessAnswer>) | null;
  /** Called with every checked Access request, for the Trace. */
  onAccessDecided?: (request: AccessRequest, result: AccessResult) => void;
}

/** The evaluation playground: only writes guarded, and nobody to approve them. */
export const EVALUATION_PERMISSIONS = {
  getPermissionMode: () => DEFAULT_PERMISSION_MODE,
  requestAccess: null,
} satisfies CreateChatToolsOptions;

/** A chat tool that touches library content declares its Access request here. */
export interface ChatToolDefinition extends ToolDefinition {
  /** Null skips the check, as for a path that does not exist; the body then reports it. */
  access?: (params: unknown) => AccessRequest | null | Promise<AccessRequest | null>;
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

export interface TranscriptWordRange extends TranscriptWord {
  start: number;
  end: number;
}

export interface LibraryFileRow {
  id: string;
  name: string;
  type: string;
  parentId?: string | null;
  storagePath?: string;
  transcriptPath?: string | null;
}

export interface LibraryIndex {
  files: Map<string, LibraryFileRow>;
  /** Folder id to its name and parent id. */
  folders: Map<string, { name: string; parentId: string | null }>;
}

export const readLibrary = (store: StoreQueryable): LibraryIndex => {
  const files = (store.query(desktopFilesQuery$) ?? []) as LibraryFileRow[];
  const folders = (store.query(desktopFoldersQuery$) ?? []) as Array<{
    id: string;
    name: string;
    parentId?: string | null;
  }>;
  return {
    files: new Map(files.map((file) => [file.id, file])),
    folders: new Map(
      folders.map((folder) => [
        folder.id,
        { name: folder.name, parentId: folder.parentId ?? null },
      ]),
    ),
  };
};

export const accessFile = (library: LibraryIndex, fileId: string): AccessFile | null => {
  const file = library.files.get(fileId);
  if (!file) return null;
  const folderId = file.parentId ?? null;
  const folderName = folderId ? library.folders.get(folderId)?.name : undefined;
  return {
    id: file.id,
    name: file.name,
    type: file.type,
    folderId,
    ...(folderName ? { folderName } : {}),
  };
};

/** The library file an OPFS path belongs to: its own file or one derived from it. */
export const accessFileForPath = (library: LibraryIndex, path: string): AccessFile | null => {
  const id = /^\/files\/([^/]+)(?:\/|$)/.exec(path)?.[1];
  if (id && library.files.has(id)) return accessFile(library, id);
  for (const file of library.files.values())
    if (file.storagePath === path || file.transcriptPath === path)
      return accessFile(library, file.id);
  return null;
};

/**
 * A read of some files, or of the whole library. Without file ids an active reference scope
 * narrows the read to the referenced files, as the tools' search does.
 */
export const libraryReadRequest = (
  store: StoreQueryable,
  options: CreateChatToolsOptions,
  base: Pick<AccessRequest, "tool" | "summary" | "query">,
  fileIds: readonly string[] | undefined,
  search = true,
): AccessRequest | null => {
  const scope = options.getReferenceScope?.() ?? EMPTY_REFERENCE_SCOPE;
  const ids = fileIds ?? (scope.isActive ? scope.fileIds : undefined);
  if (!ids) return { ...base, access: "read", search, target: { kind: "library" } };
  const library = readLibrary(store);
  const files = ids
    .map((id) => accessFile(library, id))
    .filter((file): file is AccessFile => file !== null);
  // Files that do not exist hold nothing to read; the tool reports them.
  if (files.length === 0) return null;
  return {
    ...base,
    access: "read",
    ...(search && { search }),
    target: { kind: "files", files },
  };
};
