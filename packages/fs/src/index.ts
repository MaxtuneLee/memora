type WriteData = string | ArrayBuffer | ArrayBufferView | Blob;

type FileRemoveOptions = { force?: boolean };
type DirRemoveOptions = { recursive?: boolean; force?: boolean };
type WriteOptions = { overwrite?: boolean };

export type FsEntry = {
  kind: "file" | "dir";
  name: string;
  path: string;
  getSize?: () => Promise<number>;
};

export type StatResult = {
  kind: "file" | "dir";
  path: string;
  size?: number;
};

export type GlobOptions = {
  cwd?: string;
  files?: boolean;
  dirs?: boolean;
};

const rootHandlePromise: Promise<FileSystemDirectoryHandle> =
  typeof navigator === "undefined" || !navigator.storage?.getDirectory
    ? Promise.reject(new Error("OPFS is not available. navigator.storage.getDirectory is missing."))
    : navigator.storage.getDirectory();

const normalizePath = (input: string) => {
  const raw = input.trim();
  if (!raw) return "/";
  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  return prefixed.length > 1 && prefixed.endsWith("/") ? prefixed.slice(0, -1) : prefixed;
};

const splitPath = (input: string) => {
  const normalized = normalizePath(input);
  if (normalized === "/") return [];
  return normalized.slice(1).split("/").filter(Boolean);
};

const joinPath = (base: string, name: string) => {
  const normalized = normalizePath(base);
  return normalized === "/" ? `/${name}` : `${normalized}/${name}`;
};

const dirname = (input: string) => {
  const normalized = normalizePath(input);
  if (normalized === "/") return "/";
  const parts = splitPath(normalized);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : "/";
};

const basename = (input: string) => {
  const normalized = normalizePath(input);
  if (normalized === "/") return "/";
  const parts = splitPath(normalized);
  return parts[parts.length - 1] ?? "/";
};

const isNotFoundError = (error: unknown) => {
  return error instanceof DOMException && error.name === "NotFoundError";
};

const isTypeMismatchError = (error: unknown) => {
  return error instanceof DOMException && error.name === "TypeMismatchError";
};

const isMissingEntryError = (error: unknown) =>
  isNotFoundError(error) || isTypeMismatchError(error);

const getRootHandle = async () => rootHandlePromise;

const getDirHandle = async (path: string, create = false) => {
  let handle = await getRootHandle();
  for (const segment of splitPath(path)) {
    handle = await handle.getDirectoryHandle(segment, { create });
  }
  return handle;
};

const getFileHandle = async (path: string, create = false) => {
  const segments = splitPath(path);
  const name = segments.pop();
  if (!name) {
    throw new Error("File path is required.");
  }
  const parentPath = segments.length ? `/${segments.join("/")}` : "/";
  const parentHandle = await getDirHandle(parentPath, create);
  return parentHandle.getFileHandle(name, { create });
};

const readAsArrayBuffer = async (data: WriteData) => {
  if (typeof data === "string") {
    return new TextEncoder().encode(data).buffer;
  }
  if (data instanceof Blob) {
    return data.arrayBuffer();
  }
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  throw new Error("Unsupported data type for write.");
};

export const dir = (path: string) => {
  const normalized = normalizePath(path);
  return {
    path: normalized,
    async exists() {
      try {
        await getDirHandle(normalized);
        return true;
      } catch (error) {
        if (isMissingEntryError(error)) return false;
        throw error;
      }
    },
    async create() {
      await getDirHandle(normalized, true);
    },
    async children(): Promise<FsEntry[]> {
      const handle = await getDirHandle(normalized);
      const results: FsEntry[] = [];
      for await (const entry of handle.values()) {
        if (entry.kind === "file") {
          results.push({
            kind: "file",
            name: entry.name,
            path: joinPath(normalized, entry.name),
            getSize: async () => (await entry.getFile()).size,
          });
        } else {
          results.push({
            kind: "dir",
            name: entry.name,
            path: joinPath(normalized, entry.name),
          });
        }
      }
      return results;
    },
    async remove(options?: DirRemoveOptions) {
      if (normalized === "/") {
        throw new Error("Cannot remove root directory.");
      }
      try {
        await getDirHandle(normalized);
      } catch (error) {
        if (options?.force && isMissingEntryError(error)) return;
        throw error;
      }
      const parentHandle = await getDirHandle(dirname(normalized));
      try {
        await parentHandle.removeEntry(basename(normalized), {
          recursive: options?.recursive ?? false,
        });
      } catch (error) {
        if (options?.force && isMissingEntryError(error)) return;
        throw error;
      }
    },
  };
};

export const file = (path: string) => {
  const normalized = normalizePath(path);
  return {
    path: normalized,
    async exists() {
      try {
        await getFileHandle(normalized);
        return true;
      } catch (error) {
        if (isMissingEntryError(error)) return false;
        throw error;
      }
    },
    async text() {
      const handle = await getFileHandle(normalized);
      const fileObject = await handle.getFile();
      return fileObject.text();
    },
    async arrayBuffer() {
      const handle = await getFileHandle(normalized);
      const fileObject = await handle.getFile();
      return fileObject.arrayBuffer();
    },
    async getOriginFile() {
      const handle = await getFileHandle(normalized);
      return handle.getFile();
    },
    async getSize() {
      const handle = await getFileHandle(normalized);
      const fileObject = await handle.getFile();
      return fileObject.size;
    },
    async remove(options?: FileRemoveOptions) {
      try {
        await getFileHandle(normalized);
      } catch (error) {
        if (options?.force && isMissingEntryError(error)) return;
        throw error;
      }
      const parentHandle = await getDirHandle(dirname(normalized));
      await parentHandle.removeEntry(basename(normalized));
    },
  };
};

export const write = async (path: string, data: WriteData, options?: WriteOptions) => {
  const normalized = normalizePath(path);
  if (!options?.overwrite) {
    const exists = await file(normalized).exists();
    if (exists) {
      throw new Error(`File already exists: ${normalized}`);
    }
  }
  const handle = await getFileHandle(normalized, true);
  const writable = await handle.createWritable({ keepExistingData: false });
  const buffer = await readAsArrayBuffer(data);
  await writable.write(buffer);
  await writable.close();
};

export const cat = async (path: string) => file(path).text();

export const mkdir = async (path: string, options?: { recursive?: boolean }) => {
  const normalized = normalizePath(path);
  if (options?.recursive === false) {
    const parentPath = dirname(normalized);
    const parentHandle = await getDirHandle(parentPath);
    await parentHandle.getDirectoryHandle(basename(normalized), { create: true });
    return;
  }
  await getDirHandle(normalized, true);
};

export const stat = async (path: string): Promise<StatResult> => {
  const normalized = normalizePath(path);
  try {
    const handle = await getFileHandle(normalized);
    const fileObject = await handle.getFile();
    return { kind: "file", path: normalized, size: fileObject.size };
  } catch (error) {
    if (!isMissingEntryError(error)) throw error;
  }

  const handle = await getDirHandle(normalized);
  return { kind: "dir", path: normalized };
};

export const ls = async (
  path: string,
  options?: { recursive?: boolean; includeFiles?: boolean; includeDirs?: boolean },
) => {
  const normalized = normalizePath(path);
  const includeFiles = options?.includeFiles ?? true;
  const includeDirs = options?.includeDirs ?? true;
  const recursive = options?.recursive ?? false;
  const entries: string[] = [];

  const walk = async (dirPath: string) => {
    const children = await dir(dirPath).children();
    for (const child of children) {
      if (child.kind === "file") {
        if (includeFiles) entries.push(child.path);
      } else {
        if (includeDirs) entries.push(child.path);
        if (recursive) {
          await walk(child.path);
        }
      }
    }
  };

  await walk(normalized);
  return entries;
};

const copyFile = async (from: string, to: string, overwrite = true) => {
  const data = await file(from).arrayBuffer();
  await write(to, data, { overwrite });
};

const copyDir = async (from: string, to: string, overwrite = true) => {
  await mkdir(to, { recursive: true });
  const entries = await dir(from).children();
  for (const entry of entries) {
    const destPath = joinPath(to, entry.name);
    if (entry.kind === "file") {
      await copyFile(entry.path, destPath, overwrite);
    } else {
      await copyDir(entry.path, destPath, overwrite);
    }
  }
};

export const cp = async (from: string, to: string, options?: { overwrite?: boolean }) => {
  const source = normalizePath(from);
  const dest = normalizePath(to);
  const overwrite = options?.overwrite ?? true;

  try {
    await getFileHandle(source);
    await copyFile(source, dest, overwrite);
    return;
  } catch (error) {
    if (!isMissingEntryError(error)) throw error;
  }

  await copyDir(source, dest, overwrite);
};

export const rm = async (path: string, options?: { recursive?: boolean; force?: boolean }) => {
  const normalized = normalizePath(path);
  try {
    await file(normalized).remove({ force: options?.force });
    return;
  } catch (error) {
    if (!isMissingEntryError(error)) throw error;
  }

  try {
    await dir(normalized).remove({
      recursive: options?.recursive ?? false,
      force: options?.force,
    });
  } catch (error) {
    if (options?.force && isNotFoundError(error)) return;
    throw error;
  }
};

export const mv = async (from: string, to: string, options?: { overwrite?: boolean }) => {
  await cp(from, to, options);
  await rm(from, { recursive: true, force: true });
};

export type GrepMatch = {
  path: string;
  line: number;
  column: number;
  offset: number;
  length: number;
  text: string;
};

export type GrepOptions = {
  cwd?: string;
  glob?: string;
  ignoreCase?: boolean;
  maxMatches?: number;
};

export const grep = async (pattern: string | RegExp, options?: GrepOptions) => {
  const cwd = normalizePath(options?.cwd ?? "/");
  const flags = options?.ignoreCase ? "gi" : "g";
  const regex = typeof pattern === "string" ? new RegExp(pattern, flags) : pattern;
  const max = options?.maxMatches ?? Infinity;
  const matches: GrepMatch[] = [];

  const filePaths = options?.glob
    ? await glob(options.glob, { cwd, files: true, dirs: false })
    : await ls(cwd, { recursive: true, includeFiles: true, includeDirs: false });

  for (const filePath of filePaths) {
    if (matches.length >= max) break;

    let text: string;
    try {
      text = await file(filePath).text();
    } catch {
      continue;
    }

    const lines = text.split("\n");
    let charOffset = 0;
    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= max) break;
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(lines[i])) !== null) {
        matches.push({
          path: filePath,
          line: i + 1,
          column: m.index + 1,
          offset: charOffset + m.index,
          length: m[0].length,
          text: lines[i],
        });
        if (matches.length >= max) break;
        if (!regex.global) break;
      }
      charOffset += lines[i].length + 1;
    }
  }

  return matches;
};

const globToRegExp = (segment: string) => {
  const escaped = segment.replace(/[.+^${}()|\\]/g, "\\$&");
  const regex = escaped.replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  return new RegExp(`^${regex}$`);
};

const resolveGlobBase = (pattern: string, cwd?: string) => {
  const normalized = normalizePath(pattern);
  if (pattern.startsWith("/")) return { base: "/", pattern: normalized.slice(1) };
  const base = normalizePath(cwd ?? "/");
  return { base, pattern: normalized.slice(1) };
};

export const glob = async (pattern: string, options?: GlobOptions) => {
  const includeFiles = options?.files ?? true;
  const includeDirs = options?.dirs ?? false;
  const { base, pattern: normalizedPattern } = resolveGlobBase(pattern, options?.cwd);
  const segments = normalizedPattern ? normalizedPattern.split("/").filter(Boolean) : [];
  const matches: string[] = [];

  const walk = async (currentPath: string, index: number) => {
    if (index >= segments.length) {
      if (includeFiles || includeDirs) {
        const stats = await stat(currentPath);
        if (stats.kind === "file" && includeFiles) matches.push(currentPath);
        if (stats.kind === "dir" && includeDirs) matches.push(currentPath);
      }
      return;
    }

    const segment = segments[index];
    if (segment === "**") {
      await walk(currentPath, index + 1);
      const children = await dir(currentPath).children();
      for (const child of children) {
        if (child.kind === "dir") {
          await walk(child.path, index);
        }
      }
      return;
    }

    const matcher = globToRegExp(segment);
    const children = await dir(currentPath).children();
    for (const child of children) {
      if (!matcher.test(child.name)) continue;
      await walk(child.path, index + 1);
    }
  };

  const start = base === "/" ? "/" : base;
  await walk(start, 0);
  return matches;
};
