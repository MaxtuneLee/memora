import { file as opfsFile, ls as opfsLs, rm as opfsRm, write as opfsWrite } from "@memora/fs";

import { collectionTable } from "@/livestore/collection";
import { collectionEvents } from "@/livestore/collection";
import type { file as LiveStoreFile } from "@/livestore/file";
import { fileEvents } from "@/livestore/file";
import type { folder as LiveStoreFolder } from "@/livestore/folder";
import { folderEvents } from "@/livestore/folder";
import type { provider as LiveStoreProvider } from "@/livestore/provider";
import { providerEvents } from "@/livestore/provider";
import { settingEvents, settingsTable } from "@/livestore/setting";

const EXPORT_ROOT_DIR_NAME = "memora-export";
const EXPORT_OPFS_PREFIX = `${EXPORT_ROOT_DIR_NAME}/opfs/`;
const USER_EXPORT_OPFS_ROOTS = ["/files", "/chat"] as const;
const EXCLUDED_OPFS_PATH_PREFIXES = ["/chat/skills", "/transformers-cache"] as const;
const IMPORT_RESET_OPFS_PATHS = [
  "/files",
  "/chat/profile",
  "/chat/sessions",
  "/chat/session-assets",
] as const;

type SettingsValue = {
  theme: "light" | "dark" | "system";
  language: string;
  defaultTranscriptionModel: string;
  defaultSummarizationModel: string;
  autoTranscribe: boolean;
  autoIndex: boolean;
  sidebarCollapsed: boolean;
  selectedProviderId: string;
  selectedModel: string;
  onboardingName?: string;
  onboardingCompleted?: boolean;
  onboardingSkippedAt?: string;
};

export interface StorageExportSnapshot {
  settings: SettingsValue;
  providers: readonly LiveStoreProvider[];
  files: readonly LiveStoreFile[];
  folders: readonly LiveStoreFolder[];
  collections: readonly (typeof collectionTable.Type)[];
}

export interface StorageExportProgress {
  currentFile: string;
  completedBytes: number;
  totalBytes: number;
  completedFiles: number;
  totalFiles: number;
  phase: "preparing" | "packing" | "finalizing";
}

export interface StorageImportProgress {
  currentFile: string;
  completedBytes: number;
  totalBytes: number;
  completedFiles: number;
  totalFiles: number;
  phase: "reading" | "restoring" | "finalizing";
}

export interface StorageImportResult {
  fileName: string;
  importedFiles: number;
}

interface StorageImportSnapshot {
  settings: SettingsValue;
  providers: ImportedProvider[];
  files: ImportedFile[];
  folders: ImportedFolder[];
  collections: ImportedCollection[];
}

interface ParsedZipEntry {
  path: string;
  data: Uint8Array;
}

interface StoreLike {
  commit: (...events: unknown[]) => void;
}

interface StorageImportContext {
  current: StorageExportSnapshot;
  store: StoreLike;
}

interface ImportedProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  apiFormat: LiveStoreProvider["apiFormat"];
  models: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface ImportedCollection {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface ImportedFolder {
  id: string;
  name: string;
  parentId: string | null;
  positionX: number | null;
  positionY: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  purgedAt: Date | null;
}

interface ImportedFile {
  id: string;
  name: string;
  type: LiveStoreFile["type"];
  mimeType: string;
  sizeBytes: number;
  storageType: LiveStoreFile["storageType"];
  storagePath: string;
  parentId: string | null;
  positionX: number | null;
  positionY: number | null;
  transcriptPath: string | null;
  indexedAt: Date | null;
  indexStatus: LiveStoreFile["indexStatus"];
  indexSummary: string | null;
  collectionId: string | null;
  durationSec: number | null;
  thumbnailPath: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  purgedAt: Date | null;
}

interface ExportEntryInput {
  path: string;
  data: Uint8Array;
}

interface ResolvedExportEntry extends ExportEntryInput {
  crc32: number;
  offset: number;
}

const textEncoder = new TextEncoder();

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const normalizeArchivePath = (path: string): string => {
  return path.replace(/^\/+/, "").split("/").filter(Boolean).join("/");
};

const getArchiveFileName = (opfsPath: string): string => {
  return `${EXPORT_OPFS_PREFIX}${normalizeArchivePath(opfsPath)}`;
};

const getJsonFileName = (name: string): string => {
  return `${EXPORT_ROOT_DIR_NAME}/${name}`;
};

const isExportableOpfsPath = (path: string): boolean => {
  return !EXCLUDED_OPFS_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
};

const formatTimestampSegment = (value: number): string => String(value).padStart(2, "0");

const buildExportFileName = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = formatTimestampSegment(date.getMonth() + 1);
  const day = formatTimestampSegment(date.getDate());
  const hours = formatTimestampSegment(date.getHours());
  const minutes = formatTimestampSegment(date.getMinutes());
  const seconds = formatTimestampSegment(date.getSeconds());
  return `memora-data-export-${year}${month}${day}-${hours}${minutes}${seconds}.zip`;
};

const buildManifest = (
  snapshot: StorageExportSnapshot,
  opfsFiles: readonly string[],
  exportedAt: string,
) => {
  return {
    formatVersion: 1,
    exportedAt,
    app: "Memora",
    contents: {
      settings: true,
      providers: snapshot.providers.length,
      files: snapshot.files.length,
      folders: snapshot.folders.length,
      collections: snapshot.collections.length,
      opfsFiles: opfsFiles.length,
    },
    notes: [
      "This archive contains Memora user data exported from browser storage.",
      "Downloaded local model cache files are intentionally excluded from this export.",
    ],
  };
};

const createJsonEntry = (path: string, value: unknown): ExportEntryInput => {
  return {
    path,
    data: textEncoder.encode(`${JSON.stringify(value, null, 2)}\n`),
  };
};

const createStoredEntries = async (
  snapshot: StorageExportSnapshot,
  onProgress?: (progress: StorageExportProgress) => void,
): Promise<ExportEntryInput[]> => {
  const opfsPaths = (
    await Promise.all(
      USER_EXPORT_OPFS_ROOTS.map(async (rootPath) => {
        try {
          return await opfsLs(rootPath, {
            recursive: true,
            includeFiles: true,
            includeDirs: false,
          });
        } catch {
          return [];
        }
      }),
    )
  )
    .flat()
    .filter(isExportableOpfsPath)
    .sort((left, right) => left.localeCompare(right));

  const exportedAt = new Date().toISOString();
  const jsonEntries: ExportEntryInput[] = [
    createJsonEntry(
      getJsonFileName("manifest.json"),
      buildManifest(snapshot, opfsPaths, exportedAt),
    ),
    createJsonEntry(getJsonFileName("livestore/settings.json"), snapshot.settings),
    createJsonEntry(getJsonFileName("livestore/providers.json"), snapshot.providers),
    createJsonEntry(getJsonFileName("livestore/files.json"), snapshot.files),
    createJsonEntry(getJsonFileName("livestore/folders.json"), snapshot.folders),
    createJsonEntry(getJsonFileName("livestore/collections.json"), snapshot.collections),
  ];

  const opfsEntries: ExportEntryInput[] = [];
  let completedBytes = 0;
  const totalBytes = jsonEntries.reduce((sum, entry) => sum + entry.data.byteLength, 0);

  for (const entry of jsonEntries) {
    completedBytes += entry.data.byteLength;
    onProgress?.({
      currentFile: entry.path.replace(`${EXPORT_ROOT_DIR_NAME}/`, ""),
      completedBytes,
      totalBytes,
      completedFiles: opfsEntries.length + jsonEntries.indexOf(entry) + 1,
      totalFiles: jsonEntries.length + opfsPaths.length,
      phase: "preparing",
    });
  }

  let totalExportBytes = totalBytes;
  for (const opfsPath of opfsPaths) {
    try {
      totalExportBytes += await opfsFile(opfsPath).getSize();
    } catch {
      continue;
    }
  }

  completedBytes = jsonEntries.reduce((sum, entry) => sum + entry.data.byteLength, 0);
  let completedFiles = jsonEntries.length;

  for (const opfsPath of opfsPaths) {
    try {
      const data = new Uint8Array(await opfsFile(opfsPath).arrayBuffer());
      opfsEntries.push({
        path: getArchiveFileName(opfsPath),
        data,
      });
      completedBytes += data.byteLength;
      completedFiles += 1;
      onProgress?.({
        currentFile: getArchiveFileName(opfsPath).replace(`${EXPORT_ROOT_DIR_NAME}/`, ""),
        completedBytes,
        totalBytes: totalExportBytes,
        completedFiles,
        totalFiles: jsonEntries.length + opfsPaths.length,
        phase: "preparing",
      });
    } catch {
      continue;
    }
  }

  return [...jsonEntries, ...opfsEntries];
};

const calculateCrc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const value of data) {
    crc = CRC32_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const getDosDateTime = (date = new Date()): { date: number; time: number } => {
  const year = Math.max(date.getFullYear(), 1980);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | Math.max(1, date.getDate());
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return {
    date: dosDate & 0xffff,
    time: dosTime & 0xffff,
  };
};

const writeUint16 = (view: DataView, offset: number, value: number): void => {
  view.setUint16(offset, value & 0xffff, true);
};

const writeUint32 = (view: DataView, offset: number, value: number): void => {
  view.setUint32(offset, value >>> 0, true);
};

const toBlobPart = (value: Uint8Array): ArrayBuffer => {
  return new Uint8Array(value).buffer;
};

const textDecoder = new TextDecoder();

const normalizeImportedString = (value: unknown, fallback = ""): string => {
  return typeof value === "string" ? value : fallback;
};

const normalizeImportedNullableString = (value: unknown): string | null => {
  return typeof value === "string" ? value : null;
};

const normalizeImportedNumber = (value: unknown, fallback = 0): number => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const normalizeImportedNullableNumber = (value: unknown): number | null => {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const normalizeImportedDate = (value: unknown, fallback: Date): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return fallback;
};

const normalizeImportedNullableDate = (value: unknown): Date | null => {
  if (value == null || value === "") {
    return null;
  }
  return normalizeImportedDate(value, new Date(0));
};

const normalizeImportedSettings = (value: unknown): SettingsValue => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...settingsTable.default.value };
  }

  const record = value as Record<string, unknown>;
  const theme = record.theme;
  const defaults: SettingsValue = { ...settingsTable.default.value };
  return {
    ...defaults,
    ...(theme === "light" || theme === "dark" || theme === "system" ? { theme } : {}),
    ...(typeof record.language === "string" ? { language: record.language } : {}),
    ...(typeof record.defaultTranscriptionModel === "string"
      ? { defaultTranscriptionModel: record.defaultTranscriptionModel }
      : {}),
    ...(typeof record.defaultSummarizationModel === "string"
      ? { defaultSummarizationModel: record.defaultSummarizationModel }
      : {}),
    ...(typeof record.autoTranscribe === "boolean"
      ? { autoTranscribe: record.autoTranscribe }
      : {}),
    ...(typeof record.autoIndex === "boolean" ? { autoIndex: record.autoIndex } : {}),
    ...(typeof record.sidebarCollapsed === "boolean"
      ? { sidebarCollapsed: record.sidebarCollapsed }
      : {}),
    ...(typeof record.selectedProviderId === "string"
      ? { selectedProviderId: record.selectedProviderId }
      : {}),
    ...(typeof record.selectedModel === "string" ? { selectedModel: record.selectedModel } : {}),
    ...(typeof record.onboardingName === "string" ? { onboardingName: record.onboardingName } : {}),
    ...(typeof record.onboardingCompleted === "boolean"
      ? { onboardingCompleted: record.onboardingCompleted }
      : {}),
    ...(typeof record.onboardingSkippedAt === "string"
      ? { onboardingSkippedAt: record.onboardingSkippedAt }
      : {}),
  };
};

const normalizeImportedProviders = (value: unknown): ImportedProvider[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const record = item as Record<string, unknown>;
      const createdAt = normalizeImportedDate(record.createdAt, new Date());
      const apiFormat: ImportedProvider["apiFormat"] =
        record.apiFormat === "responses" ? "responses" : "chat-completions";
      return {
        id: normalizeImportedString(record.id),
        name: normalizeImportedString(record.name),
        baseUrl: normalizeImportedString(record.baseUrl),
        apiKey: normalizeImportedString(record.apiKey),
        apiFormat,
        models: normalizeImportedString(record.models, "[]"),
        createdAt,
        updatedAt: normalizeImportedDate(record.updatedAt, createdAt),
        deletedAt: normalizeImportedNullableDate(record.deletedAt),
      };
    })
    .filter((record) => record.id);
};

const normalizeImportedCollections = (value: unknown): ImportedCollection[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const record = item as Record<string, unknown>;
      const createdAt = normalizeImportedDate(record.createdAt, new Date());
      return {
        id: normalizeImportedString(record.id),
        name: normalizeImportedString(record.name),
        parentId: normalizeImportedNullableString(record.parentId),
        color: normalizeImportedNullableString(record.color),
        createdAt,
        updatedAt: normalizeImportedDate(record.updatedAt, createdAt),
        deletedAt: normalizeImportedNullableDate(record.deletedAt),
      };
    })
    .filter((record) => record.id);
};

const normalizeImportedFolders = (value: unknown): ImportedFolder[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const record = item as Record<string, unknown>;
      const createdAt = normalizeImportedDate(record.createdAt, new Date());
      return {
        id: normalizeImportedString(record.id),
        name: normalizeImportedString(record.name),
        parentId: normalizeImportedNullableString(record.parentId),
        positionX: normalizeImportedNullableNumber(record.positionX),
        positionY: normalizeImportedNullableNumber(record.positionY),
        createdAt,
        updatedAt: normalizeImportedDate(record.updatedAt, createdAt),
        deletedAt: normalizeImportedNullableDate(record.deletedAt),
        purgedAt: normalizeImportedNullableDate(record.purgedAt),
      };
    })
    .filter((record) => record.id);
};

const normalizeImportedFiles = (value: unknown): ImportedFile[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const record = item as Record<string, unknown>;
      const createdAt = normalizeImportedDate(record.createdAt, new Date());
      const rawType = record.type;
      const rawStorageType = record.storageType;
      const rawIndexStatus = record.indexStatus;
      const type: ImportedFile["type"] =
        rawType === "audio" || rawType === "video" || rawType === "image" ? rawType : "document";
      const storageType: ImportedFile["storageType"] =
        rawStorageType === "s3" || rawStorageType === "url" ? rawStorageType : "opfs";
      const indexStatus: ImportedFile["indexStatus"] =
        rawIndexStatus === "processing" ||
        rawIndexStatus === "indexed" ||
        rawIndexStatus === "failed"
          ? rawIndexStatus
          : "pending";
      return {
        id: normalizeImportedString(record.id),
        name: normalizeImportedString(record.name),
        type,
        mimeType: normalizeImportedString(record.mimeType),
        sizeBytes: normalizeImportedNumber(record.sizeBytes),
        storageType,
        storagePath: normalizeImportedString(record.storagePath),
        parentId: normalizeImportedNullableString(record.parentId),
        positionX: normalizeImportedNullableNumber(record.positionX),
        positionY: normalizeImportedNullableNumber(record.positionY),
        transcriptPath: normalizeImportedNullableString(record.transcriptPath),
        indexedAt: normalizeImportedNullableDate(record.indexedAt),
        indexStatus,
        indexSummary: normalizeImportedNullableString(record.indexSummary),
        collectionId: normalizeImportedNullableString(record.collectionId),
        durationSec: normalizeImportedNullableNumber(record.durationSec),
        thumbnailPath: normalizeImportedNullableString(record.thumbnailPath),
        createdAt,
        updatedAt: normalizeImportedDate(record.updatedAt, createdAt),
        deletedAt: normalizeImportedNullableDate(record.deletedAt),
        purgedAt: normalizeImportedNullableDate(record.purgedAt),
      };
    })
    .filter((record) => record.id && record.storagePath);
};

const parseZipArchive = async (
  archive: Blob,
  onProgress?: (progress: StorageImportProgress) => void,
): Promise<ParsedZipEntry[]> => {
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: ParsedZipEntry[] = [];
  let offset = 0;

  while (offset + 30 <= view.byteLength) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) {
      break;
    }

    const compressionMethod = view.getUint16(offset + 8, true);
    if (compressionMethod !== 0) {
      throw new Error("This archive uses an unsupported compression mode.");
    }

    const fileNameLength = view.getUint16(offset + 26, true);
    const extraFieldLength = view.getUint16(offset + 28, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameOffset = offset + 30;
    const dataOffset = fileNameOffset + fileNameLength + extraFieldLength;
    const dataEnd = dataOffset + compressedSize;

    if (dataEnd > view.byteLength) {
      throw new Error("The import archive looks incomplete.");
    }

    const path = textDecoder.decode(bytes.slice(fileNameOffset, fileNameOffset + fileNameLength));
    const data = bytes.slice(dataOffset, dataEnd);
    entries.push({ path, data });
    offset = dataEnd;

    onProgress?.({
      currentFile: path.replace(`${EXPORT_ROOT_DIR_NAME}/`, ""),
      completedBytes: offset,
      totalBytes: bytes.byteLength,
      completedFiles: entries.length,
      totalFiles: entries.length,
      phase: "reading",
    });
  }

  if (entries.length === 0) {
    throw new Error("No importable data was found in this ZIP archive.");
  }

  return entries;
};

const readRequiredJsonEntry = (entries: readonly ParsedZipEntry[], path: string): unknown => {
  const entry = entries.find((candidate) => candidate.path === path);
  if (!entry) {
    throw new Error(`The archive is missing ${path}.`);
  }

  try {
    return JSON.parse(textDecoder.decode(entry.data)) as unknown;
  } catch {
    throw new Error(`The archive entry ${path} is not valid JSON.`);
  }
};

const parseImportSnapshot = (entries: readonly ParsedZipEntry[]): StorageImportSnapshot => {
  const manifest = readRequiredJsonEntry(entries, getJsonFileName("manifest.json")) as Record<
    string,
    unknown
  >;
  if (manifest.formatVersion !== 1) {
    throw new Error("This archive uses an unsupported Memora export format.");
  }

  return {
    settings: normalizeImportedSettings(
      readRequiredJsonEntry(entries, getJsonFileName("livestore/settings.json")),
    ),
    providers: normalizeImportedProviders(
      readRequiredJsonEntry(entries, getJsonFileName("livestore/providers.json")),
    ),
    files: normalizeImportedFiles(
      readRequiredJsonEntry(entries, getJsonFileName("livestore/files.json")),
    ),
    folders: normalizeImportedFolders(
      readRequiredJsonEntry(entries, getJsonFileName("livestore/folders.json")),
    ),
    collections: normalizeImportedCollections(
      readRequiredJsonEntry(entries, getJsonFileName("livestore/collections.json")),
    ),
  };
};

const listImportedOpfsEntries = (entries: readonly ParsedZipEntry[]): ParsedZipEntry[] => {
  return entries.filter((entry) => entry.path.startsWith(EXPORT_OPFS_PREFIX));
};

const restoreOpfsData = async (
  entries: readonly ParsedZipEntry[],
  onProgress?: (progress: StorageImportProgress) => void,
): Promise<number> => {
  for (const resetPath of IMPORT_RESET_OPFS_PATHS) {
    await opfsRm(resetPath, { recursive: true, force: true });
  }

  const totalBytes = entries.reduce((sum, entry) => sum + entry.data.byteLength, 0);
  let completedBytes = 0;

  for (const [index, entry] of entries.entries()) {
    const relativePath = entry.path.slice(EXPORT_OPFS_PREFIX.length);
    const opfsPath = `/${relativePath}`;
    await opfsWrite(opfsPath, entry.data, { overwrite: true });
    completedBytes += entry.data.byteLength;
    onProgress?.({
      currentFile: relativePath,
      completedBytes,
      totalBytes,
      completedFiles: index + 1,
      totalFiles: entries.length,
      phase: "restoring",
    });
  }

  return entries.length;
};

const applyImportedProviders = (
  current: readonly LiveStoreProvider[],
  imported: readonly ImportedProvider[],
  store: StoreLike,
): void => {
  const currentById = new Map(current.map((row) => [row.id, row]));
  const importedIds = new Set(imported.map((row) => row.id));

  for (const row of imported) {
    const existing = currentById.get(row.id);
    if (!existing) {
      store.commit(
        providerEvents.providerCreated({
          id: row.id,
          name: row.name,
          baseUrl: row.baseUrl,
          apiKey: row.apiKey,
          apiFormat: row.apiFormat,
          models: row.models,
          createdAt: row.createdAt,
        }),
      );
    } else {
      store.commit(
        providerEvents.providerUpdated({
          id: row.id,
          name: row.name,
          baseUrl: row.baseUrl,
          apiKey: row.apiKey,
          apiFormat: row.apiFormat,
          models: row.models,
          updatedAt: row.updatedAt,
        }),
      );
    }

    if (row.deletedAt) {
      store.commit(providerEvents.providerDeleted({ id: row.id, deletedAt: row.deletedAt }));
    }
  }

  for (const row of current) {
    if (!importedIds.has(row.id) && !row.deletedAt) {
      store.commit(providerEvents.providerDeleted({ id: row.id, deletedAt: new Date() }));
    }
  }
};

const applyImportedCollections = (
  current: readonly (typeof collectionTable.Type)[],
  imported: readonly ImportedCollection[],
  store: StoreLike,
): void => {
  const currentById = new Map(current.map((row) => [row.id, row]));
  const importedIds = new Set(imported.map((row) => row.id));

  for (const row of imported) {
    const existing = currentById.get(row.id);
    if (!existing) {
      store.commit(
        collectionEvents.collectionCreated({
          id: row.id,
          name: row.name,
          parentId: row.parentId ?? undefined,
          color: row.color ?? undefined,
          createdAt: row.createdAt,
        }),
      );
    } else {
      if (existing.deletedAt && !row.deletedAt) {
        store.commit(collectionEvents.collectionRestored({ id: row.id, updatedAt: row.updatedAt }));
      }
      store.commit(
        collectionEvents.collectionUpdated({
          id: row.id,
          name: row.name,
          parentId: row.parentId,
          color: row.color,
          updatedAt: row.updatedAt,
        }),
      );
    }

    if (row.deletedAt) {
      store.commit(collectionEvents.collectionDeleted({ id: row.id, deletedAt: row.deletedAt }));
    }
  }

  for (const row of current) {
    if (!importedIds.has(row.id) && !row.deletedAt) {
      store.commit(collectionEvents.collectionDeleted({ id: row.id, deletedAt: new Date() }));
    }
  }
};

const applyImportedFolders = (
  current: readonly LiveStoreFolder[],
  imported: readonly ImportedFolder[],
  store: StoreLike,
): void => {
  const currentById = new Map(current.map((row) => [row.id, row]));
  const importedIds = new Set(imported.map((row) => row.id));

  for (const row of imported) {
    const existing = currentById.get(row.id);
    if (!existing) {
      store.commit(
        folderEvents.folderCreated({
          id: row.id,
          name: row.name,
          parentId: row.parentId,
          positionX: row.positionX,
          positionY: row.positionY,
          createdAt: row.createdAt,
        }),
      );
    } else {
      if (existing.deletedAt && !row.deletedAt) {
        store.commit(folderEvents.folderRestored({ id: row.id, updatedAt: row.updatedAt }));
      }
      store.commit(
        folderEvents.folderUpdated({
          id: row.id,
          name: row.name,
          parentId: row.parentId,
          positionX: row.positionX,
          positionY: row.positionY,
          updatedAt: row.updatedAt,
        }),
      );
    }

    if (row.deletedAt) {
      store.commit(folderEvents.folderDeleted({ id: row.id, deletedAt: row.deletedAt }));
    }
    if (row.purgedAt) {
      store.commit(folderEvents.folderPurged({ id: row.id, purgedAt: row.purgedAt }));
    }
  }

  for (const row of current) {
    if (!importedIds.has(row.id)) {
      if (!row.deletedAt) {
        store.commit(folderEvents.folderDeleted({ id: row.id, deletedAt: new Date() }));
      }
      if (!row.purgedAt) {
        store.commit(folderEvents.folderPurged({ id: row.id, purgedAt: new Date() }));
      }
    }
  }
};

const applyImportedFiles = (
  current: readonly LiveStoreFile[],
  imported: readonly ImportedFile[],
  store: StoreLike,
): void => {
  const currentById = new Map(current.map((row) => [row.id, row]));
  const importedIds = new Set(imported.map((row) => row.id));

  for (const row of imported) {
    const existing = currentById.get(row.id);
    if (!existing) {
      store.commit(
        fileEvents.fileCreated({
          id: row.id,
          name: row.name,
          type: row.type,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          storageType: row.storageType,
          storagePath: row.storagePath,
          parentId: row.parentId,
          positionX: row.positionX,
          positionY: row.positionY,
          collectionId: row.collectionId ?? undefined,
          durationSec: row.durationSec ?? undefined,
          createdAt: row.createdAt,
        }),
      );
    } else {
      if (existing.deletedAt && !row.deletedAt) {
        store.commit(fileEvents.fileRestored({ id: row.id, updatedAt: row.updatedAt }));
      }
      store.commit(
        fileEvents.fileUpdated({
          id: row.id,
          name: row.name,
          parentId: row.parentId,
          positionX: row.positionX,
          positionY: row.positionY,
          collectionId: row.collectionId,
          thumbnailPath: row.thumbnailPath,
          durationSec: row.durationSec,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          storageType: row.storageType,
          storagePath: row.storagePath,
          updatedAt: row.updatedAt,
        }),
      );
    }

    if (row.transcriptPath) {
      store.commit(
        fileEvents.fileTranscribed({
          id: row.id,
          transcriptPath: row.transcriptPath,
          updatedAt: row.updatedAt,
        }),
      );
    }

    store.commit(
      fileEvents.fileIndexed({
        id: row.id,
        indexStatus: row.indexStatus,
        indexedAt: row.indexedAt ?? undefined,
        indexSummary: row.indexSummary ?? undefined,
        updatedAt: row.updatedAt,
      }),
    );

    if (row.deletedAt) {
      store.commit(fileEvents.fileDeleted({ id: row.id, deletedAt: row.deletedAt }));
    }
    if (row.purgedAt) {
      store.commit(fileEvents.filePurged({ id: row.id, purgedAt: row.purgedAt }));
    }
  }

  for (const row of current) {
    if (!importedIds.has(row.id)) {
      if (!row.deletedAt) {
        store.commit(fileEvents.fileDeleted({ id: row.id, deletedAt: new Date() }));
      }
      if (!row.purgedAt) {
        store.commit(fileEvents.filePurged({ id: row.id, purgedAt: new Date() }));
      }
    }
  }
};

const applyImportedSnapshot = (
  current: StorageExportSnapshot,
  imported: StorageImportSnapshot,
  store: StoreLike,
): void => {
  store.commit(settingEvents.settingsSet(imported.settings));
  applyImportedProviders(current.providers, imported.providers, store);
  applyImportedCollections(current.collections, imported.collections, store);
  applyImportedFolders(current.folders, imported.folders, store);
  applyImportedFiles(current.files, imported.files, store);
};

export const buildZipArchive = (
  entries: readonly ExportEntryInput[],
  onProgress?: (progress: StorageExportProgress) => void,
): Blob => {
  const resolvedEntries: ResolvedExportEntry[] = [];
  const localFileParts: Uint8Array[] = [];
  let offset = 0;
  const totalBytes = entries.reduce((sum, entry) => sum + entry.data.byteLength, 0);
  let packedBytes = 0;
  const { date, time } = getDosDateTime();

  entries.forEach((entry, index) => {
    const pathBytes = textEncoder.encode(entry.path);
    const header = new Uint8Array(30 + pathBytes.byteLength);
    const headerView = new DataView(header.buffer);
    const crc32 = calculateCrc32(entry.data);

    writeUint32(headerView, 0, 0x04034b50);
    writeUint16(headerView, 4, 20);
    writeUint16(headerView, 6, 0);
    writeUint16(headerView, 8, 0);
    writeUint16(headerView, 10, time);
    writeUint16(headerView, 12, date);
    writeUint32(headerView, 14, crc32);
    writeUint32(headerView, 18, entry.data.byteLength);
    writeUint32(headerView, 22, entry.data.byteLength);
    writeUint16(headerView, 26, pathBytes.byteLength);
    writeUint16(headerView, 28, 0);
    header.set(pathBytes, 30);

    localFileParts.push(header, entry.data);
    resolvedEntries.push({
      ...entry,
      crc32,
      offset,
    });
    offset += header.byteLength + entry.data.byteLength;
    packedBytes += entry.data.byteLength;
    onProgress?.({
      currentFile: entry.path.replace(`${EXPORT_ROOT_DIR_NAME}/`, ""),
      completedBytes: packedBytes,
      totalBytes,
      completedFiles: index + 1,
      totalFiles: entries.length,
      phase: "packing",
    });
  });

  const centralDirectoryParts: Uint8Array[] = [];
  let centralDirectorySize = 0;

  for (const entry of resolvedEntries) {
    const pathBytes = textEncoder.encode(entry.path);
    const header = new Uint8Array(46 + pathBytes.byteLength);
    const headerView = new DataView(header.buffer);

    writeUint32(headerView, 0, 0x02014b50);
    writeUint16(headerView, 4, 20);
    writeUint16(headerView, 6, 20);
    writeUint16(headerView, 8, 0);
    writeUint16(headerView, 10, 0);
    writeUint16(headerView, 12, time);
    writeUint16(headerView, 14, date);
    writeUint32(headerView, 16, entry.crc32);
    writeUint32(headerView, 20, entry.data.byteLength);
    writeUint32(headerView, 24, entry.data.byteLength);
    writeUint16(headerView, 28, pathBytes.byteLength);
    writeUint16(headerView, 30, 0);
    writeUint16(headerView, 32, 0);
    writeUint16(headerView, 34, 0);
    writeUint16(headerView, 36, 0);
    writeUint32(headerView, 38, 0);
    writeUint32(headerView, 42, entry.offset);
    header.set(pathBytes, 46);

    centralDirectoryParts.push(header);
    centralDirectorySize += header.byteLength;
  }

  const endOfCentralDirectory = new Uint8Array(22);
  const endView = new DataView(endOfCentralDirectory.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, resolvedEntries.length);
  writeUint16(endView, 10, resolvedEntries.length);
  writeUint32(endView, 12, centralDirectorySize);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  onProgress?.({
    currentFile: "archive-index",
    completedBytes: totalBytes,
    totalBytes,
    completedFiles: resolvedEntries.length,
    totalFiles: resolvedEntries.length,
    phase: "finalizing",
  });

  return new Blob(
    [
      ...localFileParts.map(toBlobPart),
      ...centralDirectoryParts.map(toBlobPart),
      toBlobPart(endOfCentralDirectory),
    ],
    {
      type: "application/zip",
    },
  );
};

const downloadBlob = (blob: Blob, fileName: string): void => {
  if (typeof document === "undefined") {
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
};

export const exportStorageArchive = async (
  snapshot: StorageExportSnapshot,
  onProgress?: (progress: StorageExportProgress) => void,
): Promise<{ fileName: string; fileCount: number }> => {
  const entries = await createStoredEntries(snapshot, onProgress);
  const archive = buildZipArchive(entries, onProgress);
  const fileName = buildExportFileName();
  downloadBlob(archive, fileName);
  return {
    fileName,
    fileCount: entries.length,
  };
};

export const importStorageArchive = async (
  archive: File,
  context: StorageImportContext,
  onProgress?: (progress: StorageImportProgress) => void,
): Promise<StorageImportResult> => {
  const entries = await parseZipArchive(archive, onProgress);
  const snapshot = parseImportSnapshot(entries);
  const opfsEntries = listImportedOpfsEntries(entries);
  const importedFiles = await restoreOpfsData(opfsEntries, onProgress);
  applyImportedSnapshot(context.current, snapshot, context.store);
  onProgress?.({
    currentFile: "restore-complete",
    completedBytes: opfsEntries.reduce((sum, entry) => sum + entry.data.byteLength, 0),
    totalBytes: opfsEntries.reduce((sum, entry) => sum + entry.data.byteLength, 0),
    completedFiles: importedFiles,
    totalFiles: importedFiles,
    phase: "finalizing",
  });

  return {
    fileName: archive.name,
    importedFiles,
  };
};
