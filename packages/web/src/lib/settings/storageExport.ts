import {
  file as opfsFile,
  ls as opfsLs,
  rm as opfsRm,
  writeStream as opfsWriteStream,
} from "@memora/fs";
import { Schema } from "@livestore/livestore";

import { assertNoPathMutationConflicts } from "@/lib/editor/pathMutations";
import { collectionTable } from "@/livestore/collection";
import { collectionEvents } from "@/livestore/collection";
import type { file as LiveStoreFile } from "@/livestore/file";
import { fileEvents } from "@/livestore/file";
import type { folder as LiveStoreFolder } from "@/livestore/folder";
import { folderEvents } from "@/livestore/folder";
import type { provider as LiveStoreProvider } from "@/livestore/provider";
import { providerEvents, toProviderMetadata } from "@/livestore/provider";
import { providerCredentialEvents } from "@/livestore/providerCredential";
import { parseProviderModels } from "@/lib/settings/dialogHelpers";
import { redactProviderEndpoint } from "@/lib/settings/providerEndpoint";
import { buildZipArchive, readZipArchive, type ZipReadEntry } from "@/lib/settings/zipArchive";
import { normalizeAiModelRouting } from "@/lib/models/modelRouting";
import { normalizeLocalModelUsageTotals } from "@/lib/models/localTokenUsage";
import {
  normalizeSettingsValue,
  settingEvents,
  settingsStoredValueSchema,
  type setting,
} from "@/livestore/setting";
import {
  BUILTIN_WIDGET_KEYS,
  DATA_SOURCE_NAMES,
  widgetEvents,
  type widgetDefinition as LiveStoreWidgetDefinition,
  type widgetInstance as LiveStoreWidgetInstance,
} from "@/livestore/widget";

// The archive layout is documented in docs/data-export-format.md. Update it with any change here.
export const EXPORT_FORMAT_VERSION = 2;
const SUPPORTED_FORMAT_VERSIONS = new Set([1, 2]);
const EXPORT_ROOT_DIR_NAME = "memora-export";
const EXPORT_OPFS_PREFIX = `${EXPORT_ROOT_DIR_NAME}/opfs/`;
const USER_EXPORT_OPFS_ROOTS = ["/files", "/chat"] as const;
const EXCLUDED_OPFS_PATH_PREFIXES = ["/chat/skills", "/transformers-cache"] as const;

type SettingsValue = setting;

export interface StorageExportSnapshot {
  settings: SettingsValue;
  providers: readonly LiveStoreProvider[];
  files: readonly LiveStoreFile[];
  folders: readonly LiveStoreFolder[];
  collections: readonly (typeof collectionTable.Type)[];
  widgetDefinitions: readonly LiveStoreWidgetDefinition[];
  widgetInstances: readonly LiveStoreWidgetInstance[];
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
  /** Null for format 1 archives, which predate widget export. */
  widgets: { definitions: ImportedWidgetDefinition[]; instances: ImportedWidgetInstance[] } | null;
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

type ImportedWidgetDefinition = Omit<LiveStoreWidgetDefinition, "deletedAt"> & {
  deletedAt: Date | null;
};

type ImportedWidgetInstance = Omit<LiveStoreWidgetInstance, "deletedAt"> & {
  deletedAt: Date | null;
};

interface ExportEntry {
  path: string;
  data: Blob;
}

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
  return (
    USER_EXPORT_OPFS_ROOTS.some((root) => path.startsWith(`${root}/`)) &&
    !EXCLUDED_OPFS_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
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
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt,
    app: "Memora",
    contents: {
      settings: true,
      providers: snapshot.providers.length,
      files: snapshot.files.length,
      folders: snapshot.folders.length,
      collections: snapshot.collections.length,
      widgetDefinitions: snapshot.widgetDefinitions.length,
      widgetInstances: snapshot.widgetInstances.length,
      opfsFiles: opfsFiles.length,
    },
    notes: [
      "This archive contains Memora user data exported from browser storage.",
      "Downloaded local model cache files and search indexes are intentionally excluded. Memora rebuilds search indexes after import.",
      "Provider API keys are device-local and intentionally excluded. Enter them again on a new device.",
    ],
  };
};

const createJsonEntry = (path: string, value: unknown): ExportEntry => {
  return {
    path,
    data: new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" }),
  };
};

const listExportableOpfsFiles = async (): Promise<string[]> => {
  const paths = await Promise.all(
    USER_EXPORT_OPFS_ROOTS.map(async (rootPath) => {
      try {
        return await opfsLs(rootPath, { recursive: true, includeFiles: true, includeDirs: false });
      } catch {
        return [];
      }
    }),
  );
  return paths
    .flat()
    .filter(isExportableOpfsPath)
    .sort((left, right) => left.localeCompare(right));
};

const createExportEntries = async (
  snapshot: StorageExportSnapshot,
  onProgress?: (progress: StorageExportProgress) => void,
): Promise<ExportEntry[]> => {
  const opfsPaths = await listExportableOpfsFiles();
  const exportedAt = new Date().toISOString();
  const entries: ExportEntry[] = [
    createJsonEntry(
      getJsonFileName("manifest.json"),
      buildManifest(snapshot, opfsPaths, exportedAt),
    ),
    createJsonEntry(getJsonFileName("livestore/settings.json"), {
      ...snapshot.settings,
      modelRouting: normalizeAiModelRouting(snapshot.settings.modelRouting, snapshot.settings),
    }),
    createJsonEntry(
      getJsonFileName("livestore/providers.json"),
      snapshot.providers.map(toProviderMetadata),
    ),
    createJsonEntry(getJsonFileName("livestore/files.json"), snapshot.files),
    createJsonEntry(getJsonFileName("livestore/folders.json"), snapshot.folders),
    createJsonEntry(getJsonFileName("livestore/collections.json"), snapshot.collections),
    createJsonEntry(
      getJsonFileName("livestore/widget-definitions.json"),
      snapshot.widgetDefinitions,
    ),
    createJsonEntry(getJsonFileName("livestore/widget-instances.json"), snapshot.widgetInstances),
  ];

  for (const [index, opfsPath] of opfsPaths.entries()) {
    onProgress?.({
      currentFile: opfsPath,
      completedBytes: 0,
      totalBytes: 0,
      completedFiles: index,
      totalFiles: opfsPaths.length,
      phase: "preparing",
    });
    let data: Blob;
    try {
      // A disk-backed File: the archive Blob references it instead of copying it into memory.
      data = await opfsFile(opfsPath).getOriginFile();
    } catch {
      throw new Error(`Could not read ${opfsPath}. Nothing was exported.`);
    }
    entries.push({ path: getArchiveFileName(opfsPath), data });
  }

  return entries;
};

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

// One validator per stored settings field, so a setting added to the schema is imported
// without touching this file, and one bad field only falls back to its own default.
const SETTINGS_FIELD_VALIDATORS = Object.entries(settingsStoredValueSchema.fields).map(
  ([key, field]) => [key, Schema.is(Schema.Struct({ [key]: field }))] as const,
);

export const normalizeImportedSettings = (value: unknown): SettingsValue => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalizeSettingsValue({});
  }

  const record = value as Record<string, unknown>;
  const accepted: Record<string, unknown> = {};
  for (const [key, isValid] of SETTINGS_FIELD_VALIDATORS) {
    if (record[key] !== undefined && isValid({ [key]: record[key] })) {
      accepted[key] = record[key];
    }
  }

  delete accepted.localModelTokenUsage;
  delete accepted.modelRouting;
  const localModelTokenUsage = normalizeLocalModelUsageTotals(record.localModelTokenUsage);
  return normalizeSettingsValue({
    ...(accepted as Partial<SettingsValue>),
    ...(localModelTokenUsage ? { localModelTokenUsage } : {}),
    ...(record.modelRouting !== undefined
      ? {
          modelRouting: normalizeAiModelRouting(record.modelRouting, {
            selectedProviderId:
              typeof record.selectedProviderId === "string" ? record.selectedProviderId : undefined,
            selectedModel:
              typeof record.selectedModel === "string" ? record.selectedModel : undefined,
          }),
        }
      : {}),
  });
};

const normalizeImportedProviders = (value: unknown): ImportedProvider[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const record = item as Record<string, unknown>;
      const createdAt = normalizeImportedDate(record.createdAt, new Date());
      const apiFormat: ImportedProvider["apiFormat"] =
        record.apiFormat === "responses" ||
        record.apiFormat === "anthropic-messages" ||
        record.apiFormat === "gemini"
          ? record.apiFormat
          : "chat-completions";
      return {
        id: normalizeImportedString(record.id),
        name: normalizeImportedString(record.name),
        baseUrl: redactProviderEndpoint(normalizeImportedString(record.baseUrl)),
        apiFormat,
        models: JSON.stringify(
          parseProviderModels({ models: normalizeImportedString(record.models, "[]") }),
        ),
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

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);

const normalizeImportedWidgetDefinitions = (value: unknown): ImportedWidgetDefinition[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const record = item as Record<string, unknown>;
      const createdAt = normalizeImportedDate(record.createdAt, new Date());
      return {
        id: normalizeImportedString(record.id),
        kind: record.kind === "builtin" ? ("builtin" as const) : ("generated" as const),
        builtinKey: isOneOf(BUILTIN_WIDGET_KEYS, record.builtinKey) ? record.builtinKey : null,
        name: normalizeImportedString(record.name),
        widgetCode: normalizeImportedString(record.widgetCode),
        dataSourceName: isOneOf(DATA_SOURCE_NAMES, record.dataSourceName)
          ? record.dataSourceName
          : null,
        dataSourceParams: normalizeImportedString(record.dataSourceParams, "{}"),
        folderId: normalizeImportedNullableString(record.folderId),
        sourceFileId: normalizeImportedNullableString(record.sourceFileId),
        createdAt,
        updatedAt: normalizeImportedDate(record.updatedAt, createdAt),
        deletedAt: normalizeImportedNullableDate(record.deletedAt),
      };
    })
    .filter((record) => record.id);
};

const normalizeImportedWidgetInstances = (value: unknown): ImportedWidgetInstance[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const record = item as Record<string, unknown>;
      const createdAt = normalizeImportedDate(record.createdAt, new Date());
      return {
        id: normalizeImportedString(record.id),
        definitionId: normalizeImportedString(record.definitionId),
        sortOrder: normalizeImportedNumber(record.sortOrder),
        params: normalizeImportedString(record.params, "{}"),
        columnSpan: normalizeImportedNumber(record.columnSpan, 1),
        rowSpan: normalizeImportedNumber(record.rowSpan, 1),
        createdAt,
        updatedAt: normalizeImportedDate(record.updatedAt, createdAt),
        deletedAt: normalizeImportedNullableDate(record.deletedAt),
      };
    })
    .filter((record) => record.id && record.definitionId);
};

const readJsonEntry = async (
  entries: readonly ZipReadEntry[],
  path: string,
  options: { required: boolean } = { required: true },
): Promise<unknown> => {
  const entry = entries.find((candidate) => candidate.path === path);
  if (!entry) {
    if (!options.required) return undefined;
    throw new Error(`The archive is missing ${path}.`);
  }

  const text = await new Response(entry.open()).text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`The archive entry ${path} is not valid JSON.`);
  }
};

const parseImportSnapshot = async (
  entries: readonly ZipReadEntry[],
): Promise<StorageImportSnapshot> => {
  const manifest = await readJsonEntry(entries, getJsonFileName("manifest.json"));
  const formatVersion =
    manifest && typeof manifest === "object"
      ? (manifest as Record<string, unknown>).formatVersion
      : undefined;
  if (typeof formatVersion !== "number" || !SUPPORTED_FORMAT_VERSIONS.has(formatVersion)) {
    throw new Error(
      typeof formatVersion === "number" && formatVersion > EXPORT_FORMAT_VERSION
        ? "This archive was made by a newer version of Memora. Update Memora and try again."
        : "This archive uses an unsupported Memora export format.",
    );
  }

  const storedSettings = await readJsonEntry(entries, getJsonFileName("livestore/settings.json"));
  const settings = normalizeImportedSettings(storedSettings);
  // Format 1 archives from before routing was merged into settings.
  const hasNestedRouting =
    typeof storedSettings === "object" &&
    storedSettings !== null &&
    "modelRouting" in storedSettings;
  const legacyRouting = hasNestedRouting
    ? undefined
    : await readJsonEntry(entries, getJsonFileName("livestore/model-routing.json"), {
        required: false,
      });
  settings.modelRouting = normalizeAiModelRouting(legacyRouting ?? settings.modelRouting, settings);

  const widgetDefinitions = await readJsonEntry(
    entries,
    getJsonFileName("livestore/widget-definitions.json"),
    { required: formatVersion >= 2 },
  );
  const widgetInstances = await readJsonEntry(
    entries,
    getJsonFileName("livestore/widget-instances.json"),
    { required: formatVersion >= 2 },
  );

  return {
    settings,
    providers: normalizeImportedProviders(
      await readJsonEntry(entries, getJsonFileName("livestore/providers.json")),
    ),
    files: normalizeImportedFiles(
      await readJsonEntry(entries, getJsonFileName("livestore/files.json")),
    ),
    folders: normalizeImportedFolders(
      await readJsonEntry(entries, getJsonFileName("livestore/folders.json")),
    ),
    collections: normalizeImportedCollections(
      await readJsonEntry(entries, getJsonFileName("livestore/collections.json")),
    ),
    widgets:
      formatVersion >= 2
        ? {
            definitions: normalizeImportedWidgetDefinitions(widgetDefinitions),
            instances: normalizeImportedWidgetInstances(widgetInstances),
          }
        : null,
  };
};

interface ImportedOpfsEntry {
  opfsPath: string;
  entry: ZipReadEntry;
}

// Only paths an export can produce are restored, so an archive cannot write over app internals
// such as the LiveStore database or the model cache.
const listImportedOpfsEntries = (entries: readonly ZipReadEntry[]): ImportedOpfsEntry[] => {
  return entries
    .filter((entry) => entry.path.startsWith(EXPORT_OPFS_PREFIX))
    .map((entry) => {
      const segments = entry.path.slice(EXPORT_OPFS_PREFIX.length).split("/");
      const opfsPath = `/${segments.filter(Boolean).join("/")}`;
      if (segments.some((segment) => segment === "." || segment === "..")) {
        throw new Error(`The archive entry ${entry.path} has an invalid path.`);
      }
      if (!isExportableOpfsPath(opfsPath)) {
        throw new Error(`The archive entry ${entry.path} is outside Memora's user data.`);
      }
      return { opfsPath, entry };
    });
};

// Reads every file once before anything is deleted, so a damaged archive fails without
// touching existing data.
const verifyOpfsEntries = async (
  entries: readonly ImportedOpfsEntry[],
  onProgress?: (progress: StorageImportProgress) => void,
): Promise<void> => {
  const totalBytes = entries.reduce((sum, { entry }) => sum + entry.size, 0);
  let completedBytes = 0;
  for (const [index, { opfsPath, entry }] of entries.entries()) {
    const reader = entry.open().getReader();
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
    completedBytes += entry.size;
    onProgress?.({
      currentFile: opfsPath,
      completedBytes,
      totalBytes,
      completedFiles: index + 1,
      totalFiles: entries.length,
      phase: "reading",
    });
  }
};

const clearExportableOpfsData = async (): Promise<void> => {
  for (const root of USER_EXPORT_OPFS_ROOTS) {
    let children: string[];
    try {
      children = await opfsLs(root, { recursive: false, includeFiles: true, includeDirs: true });
    } catch {
      continue;
    }
    for (const child of children) {
      if (isExportableOpfsPath(child)) {
        await opfsRm(child, { recursive: true, force: true });
      }
    }
  }
};

const restoreOpfsData = async (
  entries: readonly ImportedOpfsEntry[],
  onProgress?: (progress: StorageImportProgress) => void,
): Promise<number> => {
  await clearExportableOpfsData();

  const totalBytes = entries.reduce((sum, { entry }) => sum + entry.size, 0);
  let completedBytes = 0;

  for (const [index, { opfsPath, entry }] of entries.entries()) {
    await opfsWriteStream(opfsPath, entry.open(), { overwrite: true });
    completedBytes += entry.size;
    onProgress?.({
      currentFile: opfsPath,
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
          apiFormat: row.apiFormat,
          models: row.models,
          updatedAt: row.updatedAt,
        }),
      );
    }

    if (row.deletedAt) {
      store.commit(providerEvents.providerDeleted({ id: row.id, deletedAt: row.deletedAt }));
      store.commit(providerCredentialEvents.providerCredentialDeleted({ providerId: row.id }));
    }
  }

  for (const row of current) {
    if (!importedIds.has(row.id) && !row.deletedAt) {
      store.commit(providerEvents.providerDeleted({ id: row.id, deletedAt: new Date() }));
      store.commit(providerCredentialEvents.providerCredentialDeleted({ providerId: row.id }));
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
    } else if (existing.deletedAt && !row.deletedAt) {
      store.commit(fileEvents.fileRestored({ id: row.id, updatedAt: row.updatedAt }));
    }
    // fileCreated has no thumbnailPath, so new rows need the update as well.
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

const applyImportedWidgets = (
  current: Pick<StorageExportSnapshot, "widgetDefinitions" | "widgetInstances">,
  imported: NonNullable<StorageImportSnapshot["widgets"]>,
  store: StoreLike,
): void => {
  const currentDefinitions = new Map(current.widgetDefinitions.map((row) => [row.id, row]));
  const importedDefinitionIds = new Set(imported.definitions.map((row) => row.id));

  for (const row of imported.definitions) {
    const existing = currentDefinitions.get(row.id);
    if (!existing) {
      store.commit(
        widgetEvents.widgetDefinitionCreated({
          id: row.id,
          kind: row.kind,
          builtinKey: row.builtinKey ?? undefined,
          name: row.name,
          widgetCode: row.widgetCode,
          dataSourceName: row.dataSourceName ?? undefined,
          dataSourceParams: row.dataSourceParams,
          folderId: row.folderId ?? undefined,
          sourceFileId: row.sourceFileId ?? undefined,
          createdAt: row.createdAt,
        }),
      );
    } else {
      // ponytail: there is no definition restore event and widgetCode is immutable, so a row
      // already deleted on this device stays deleted. Add events if that case shows up.
      store.commit(
        widgetEvents.widgetDefinitionUpdated({
          id: row.id,
          name: row.name,
          dataSourceName: row.dataSourceName,
          dataSourceParams: row.dataSourceParams,
          folderId: row.folderId ?? undefined,
          sourceFileId: row.sourceFileId ?? undefined,
          updatedAt: row.updatedAt,
        }),
      );
    }
    if (row.deletedAt && !existing?.deletedAt) {
      store.commit(widgetEvents.widgetDefinitionDeleted({ id: row.id, deletedAt: row.deletedAt }));
    }
  }

  for (const row of current.widgetDefinitions) {
    if (!importedDefinitionIds.has(row.id) && !row.deletedAt) {
      store.commit(widgetEvents.widgetDefinitionDeleted({ id: row.id, deletedAt: new Date() }));
    }
  }

  const currentInstances = new Map(current.widgetInstances.map((row) => [row.id, row]));
  const importedInstanceIds = new Set(imported.instances.map((row) => row.id));

  for (const row of imported.instances) {
    const existing = currentInstances.get(row.id);
    if (!existing) {
      store.commit(
        widgetEvents.widgetInstanceCreated({
          id: row.id,
          definitionId: row.definitionId,
          sortOrder: row.sortOrder,
          params: row.params,
          columnSpan: row.columnSpan,
          rowSpan: row.rowSpan,
          createdAt: row.createdAt,
        }),
      );
    } else {
      if (existing.deletedAt && !row.deletedAt) {
        store.commit(widgetEvents.widgetInstanceRestored({ id: row.id, updatedAt: row.updatedAt }));
      }
      store.commit(
        widgetEvents.widgetInstanceUpdated({
          id: row.id,
          params: row.params,
          updatedAt: row.updatedAt,
        }),
      );
      store.commit(
        widgetEvents.widgetInstanceResized({
          id: row.id,
          columnSpan: row.columnSpan,
          rowSpan: row.rowSpan,
          updatedAt: row.updatedAt,
        }),
      );
    }
    if (row.deletedAt) {
      store.commit(widgetEvents.widgetInstanceDeleted({ id: row.id, deletedAt: row.deletedAt }));
    }
  }

  for (const row of current.widgetInstances) {
    if (!importedInstanceIds.has(row.id) && !row.deletedAt) {
      store.commit(widgetEvents.widgetInstanceDeleted({ id: row.id, deletedAt: new Date() }));
    }
  }

  // Existing rows keep their local sortOrder until reordered to the archive's order.
  const orderedIds = imported.instances
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((row) => row.id);
  if (orderedIds.length > 0) {
    store.commit(widgetEvents.widgetInstanceReordered({ orderedIds, updatedAt: new Date() }));
  }
};

const applyImportedSnapshot = (
  current: StorageExportSnapshot,
  imported: StorageImportSnapshot,
  store: StoreLike,
): void => {
  const settings = imported.widgets
    ? imported.settings
    : {
        // Format 1 archives carry no widget rows, so keep this device's widgets seeded as they are.
        ...imported.settings,
        homeGridSeeded: current.settings.homeGridSeeded,
        widgetFoldersSeeded: current.settings.widgetFoldersSeeded,
      };
  // Device-only fields (such as local model usage) restore to this device; the rest sync.
  store.commit(settingEvents.settingsSet(settings), settingEvents.deviceSettingsSet(settings));
  applyImportedProviders(current.providers, imported.providers, store);
  applyImportedCollections(current.collections, imported.collections, store);
  applyImportedFolders(current.folders, imported.folders, store);
  applyImportedFiles(current.files, imported.files, store);
  if (imported.widgets) {
    applyImportedWidgets(current, imported.widgets, store);
  }
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
  const entries = await createExportEntries(snapshot, onProgress);
  const totalBytes = entries.reduce((sum, entry) => sum + entry.data.size, 0);
  let completedBytes = 0;
  const archive = await buildZipArchive(entries, (entry, index) => {
    completedBytes += entry.data.size;
    onProgress?.({
      currentFile: entry.path.replace(`${EXPORT_ROOT_DIR_NAME}/`, ""),
      completedBytes,
      totalBytes,
      completedFiles: index + 1,
      totalFiles: entries.length,
      phase: "packing",
    });
  });
  onProgress?.({
    currentFile: "archive-index",
    completedBytes: totalBytes,
    totalBytes,
    completedFiles: entries.length,
    totalFiles: entries.length,
    phase: "finalizing",
  });
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
  const entries = await readZipArchive(archive);
  const snapshot = await parseImportSnapshot(entries);
  assertNoPathMutationConflicts({
    files: snapshot.files,
    folders: snapshot.folders,
  });
  const opfsEntries = listImportedOpfsEntries(entries);
  await verifyOpfsEntries(opfsEntries, onProgress);
  const importedFiles = await restoreOpfsData(opfsEntries, onProgress);
  applyImportedSnapshot(context.current, snapshot, context.store);
  const totalBytes = opfsEntries.reduce((sum, { entry }) => sum + entry.size, 0);
  onProgress?.({
    currentFile: "restore-complete",
    completedBytes: totalBytes,
    totalBytes,
    completedFiles: importedFiles,
    totalFiles: importedFiles,
    phase: "finalizing",
  });

  return {
    fileName: archive.name,
    importedFiles,
  };
};
