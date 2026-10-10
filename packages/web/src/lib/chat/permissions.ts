import type { ResolvedReferenceScope } from "@/lib/chat/tools/shared";

export type PermissionGuard = "writes" | "reads-and-writes";
export type PermissionApprover = "user" | "auto";

/** Which accesses need approval, and who approves them. */
export interface PermissionMode {
  guard: PermissionGuard;
  approver: PermissionApprover;
}

export const DEFAULT_PERMISSION_MODE: PermissionMode = { guard: "writes", approver: "user" };

export type PermissionGrantTarget =
  | { kind: "file"; fileId: string }
  | { kind: "folder"; folderId: string }
  | { kind: "library" }
  | { kind: "path-prefix"; prefix: string };

export interface PermissionGrant {
  id: string;
  access: "read" | "write";
  target: PermissionGrantTarget;
  createdAt: number;
}

/** Display metadata for a library file; never its content. */
export interface AccessFile {
  id: string;
  name: string;
  type: string;
  folderId: string | null;
  folderName?: string;
}

export type AccessTarget =
  | { kind: "files"; files: AccessFile[] }
  | { kind: "library" }
  /** An existing OPFS path outside the library, such as a chat working file. */
  | { kind: "path"; path: string }
  /** A library document that does not exist yet. */
  | { kind: "new-file"; name: string; folder: { id: string; name: string } | null };

export interface AccessWrite {
  operation: "create" | "write" | "append" | "replace";
  contentLength: number;
  overwrite: boolean;
  /** Shown to the user in the dialog; never to Auto review. */
  edits?: { oldText: string; newText: string }[];
}

/** What a tool call is about to read or write, declared before it runs. */
export interface AccessRequest {
  tool: string;
  access: "read" | "write";
  /** Reads through a search, whose snippets count as reads of the whole target. */
  search?: boolean;
  target: AccessTarget;
  write?: AccessWrite;
}

export type AccessDecision =
  | "allow_once"
  | "allow_file"
  | "allow_folder"
  | "allow_library"
  | "deny";

export interface AccessAnswer {
  decision: AccessDecision;
  source: "user" | "auto";
  reason?: string;
}

export type AccessSource =
  | "reference"
  | "chat-files"
  | "unguarded"
  | "grant"
  | "user"
  | "auto"
  | "no-handler";

export interface AccessResult {
  allowed: boolean;
  source: AccessSource;
  reason?: string;
}

const CHAT_FILES_PREFIX = "/chat/";

const folderChain = (
  folderId: string | null,
  folders: ReadonlyMap<string, string | null>,
): Set<string> => {
  const chain = new Set<string>();
  // The has() check stops on a parent cycle; a valid tree never has one.
  for (let id = folderId; id && !chain.has(id); id = folders.get(id) ?? null) chain.add(id);
  return chain;
};

const coversFolder = (
  grants: readonly PermissionGrant[],
  folderId: string | null,
  folders: ReadonlyMap<string, string | null>,
): boolean => {
  const chain = folderChain(folderId, folders);
  return grants.some(
    (grant) =>
      grant.target.kind === "library" ||
      (grant.target.kind === "folder" && chain.has(grant.target.folderId)),
  );
};

/** The part of a target no grant covers, or null when grants cover all of it. */
export const uncoveredTarget = (
  target: AccessTarget,
  access: "read" | "write",
  allGrants: readonly PermissionGrant[],
  folders: ReadonlyMap<string, string | null>,
): AccessTarget | null => {
  const grants = allGrants.filter((grant) => grant.access === access);
  switch (target.kind) {
    case "files": {
      const files = target.files.filter(
        (file) =>
          !grants.some(
            (grant) => grant.target.kind === "file" && grant.target.fileId === file.id,
          ) && !coversFolder(grants, file.folderId, folders),
      );
      return files.length ? { kind: "files", files } : null;
    }
    case "library":
      return grants.some((grant) => grant.target.kind === "library") ? null : target;
    case "path":
      return grants.some(
        (grant) =>
          grant.target.kind === "path-prefix" && target.path.startsWith(grant.target.prefix),
      )
        ? null
        : target;
    case "new-file":
      return coversFolder(grants, target.folder?.id ?? null, folders) ? null : target;
  }
};

const sharedFolderId = (target: AccessTarget): string | null => {
  if (target.kind === "new-file") return target.folder?.id ?? null;
  if (target.kind !== "files") return null;
  const ids = new Set(target.files.map((file) => file.folderId));
  const [only] = ids;
  return ids.size === 1 ? (only ?? null) : null;
};

const parentPrefix = (path: string): string => path.slice(0, path.lastIndexOf("/") + 1) || "/";

/** The dialog choices that make sense for a request. */
export const availableDecisions = (request: AccessRequest): AccessDecision[] => {
  const { target } = request;
  return [
    "allow_once",
    ...(target.kind === "files" ? (["allow_file"] as const) : []),
    ...(target.kind === "path" || sharedFolderId(target) ? (["allow_folder"] as const) : []),
    ...(target.kind === "path" ? [] : (["allow_library"] as const)),
    "deny",
  ];
};

/** The grants an "always" choice saves; none for allow once or deny. */
export const grantsForDecision = (
  request: AccessRequest,
  decision: AccessDecision,
  now = Date.now(),
): PermissionGrant[] => {
  const grant = (target: PermissionGrantTarget): PermissionGrant => ({
    id: crypto.randomUUID(),
    access: request.access,
    target,
    createdAt: now,
  });
  const { target } = request;
  if (decision === "allow_file" && target.kind === "files")
    return target.files.map((file) => grant({ kind: "file", fileId: file.id }));
  if (decision === "allow_folder") {
    if (target.kind === "path")
      return [grant({ kind: "path-prefix", prefix: parentPrefix(target.path) })];
    const folderId = sharedFolderId(target);
    return folderId ? [grant({ kind: "folder", folderId })] : [];
  }
  if (decision === "allow_library" && target.kind !== "path") return [grant({ kind: "library" })];
  return [];
};

export interface AccessCheckContext {
  mode: PermissionMode;
  grants: readonly PermissionGrant[];
  scope: ResolvedReferenceScope;
  /** Folder id to parent id, from the live folder tree. */
  folders: ReadonlyMap<string, string | null>;
  requestAccess?: (request: AccessRequest) => Promise<AccessAnswer>;
  addGrants?: (grants: PermissionGrant[]) => void;
}

/** Reference scope (reads only), then Permission grants, then the approver. */
export const checkAccess = async (
  request: AccessRequest,
  context: AccessCheckContext,
): Promise<{ result: AccessResult; asked?: AccessRequest }> => {
  let target: AccessTarget = request.target;
  if (request.access === "read") {
    if (target.kind === "path" && target.path.startsWith(CHAT_FILES_PREFIX))
      return { result: { allowed: true, source: "chat-files" } };
    if (context.scope.isActive && target.kind === "files") {
      const scoped = new Set(context.scope.fileIds);
      const outside = target.files.filter((file) => !scoped.has(file.id));
      if (outside.length === 0) return { result: { allowed: true, source: "reference" } };
      target = { kind: "files", files: outside };
    }
    if (context.mode.guard === "writes" && !context.scope.isActive)
      return { result: { allowed: true, source: "unguarded" } };
  }

  const uncovered = uncoveredTarget(target, request.access, context.grants, context.folders);
  if (!uncovered) return { result: { allowed: true, source: "grant" } };

  if (!context.requestAccess) {
    return {
      result:
        request.access === "read"
          ? { allowed: true, source: "no-handler" }
          : {
              allowed: false,
              source: "no-handler",
              reason: "This change requires user approval, but no approval handler is configured.",
            },
    };
  }

  const asked: AccessRequest = { ...request, target: uncovered };
  const answer = await context.requestAccess(asked);
  if (answer.decision === "deny") {
    return {
      asked,
      result: {
        allowed: false,
        source: answer.source,
        reason:
          answer.reason ??
          (request.access === "read"
            ? "The user denied this read."
            : "The user denied this change."),
      },
    };
  }
  // Auto review only ever allows once; its decisions never become grants.
  if (answer.source === "user") {
    const grants = grantsForDecision(asked, answer.decision);
    if (grants.length) context.addGrants?.(grants);
  }
  return {
    asked,
    result: {
      allowed: true,
      source: answer.source,
      ...(answer.reason ? { reason: answer.reason } : {}),
    },
  };
};
