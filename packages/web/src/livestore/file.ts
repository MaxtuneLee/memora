import { Events, Schema, State } from "@livestore/livestore";

type FileType = "audio" | "video" | "image" | "document";
type StorageType = "opfs" | "s3" | "url";
type IndexStatus = "pending" | "processing" | "indexed" | "failed";

const FileTypeSchema = Schema.Literal("audio", "video", "image", "document");
const StorageTypeSchema = Schema.Literal("opfs", "s3", "url");
const IndexStatusSchema = Schema.Literal(
  "pending",
  "processing",
  "indexed",
  "failed",
);

type FileCreatedEvent = {
  id: string;
  name: string;
  type: FileType;
  mimeType: string;
  sizeBytes: number;
  storageType: StorageType;
  storagePath: string;
  parentId?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  collectionId?: string;
  durationSec?: number;
  createdAt: Date;
};

type FileUpdatedEvent = {
  id: string;
  name?: string;
  parentId?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  collectionId?: string | null;
  thumbnailPath?: string | null;
  durationSec?: number | null;
  mimeType?: string;
  sizeBytes?: number;
  storageType?: StorageType;
  storagePath?: string;
  updatedAt: Date;
};

type FileTranscribedEvent = {
  id: string;
  transcriptPath: string;
  updatedAt: Date;
};

type FileIndexedEvent = {
  id: string;
  indexStatus: IndexStatus;
  indexedAt?: Date;
  indexSummary?: string;
  updatedAt: Date;
};

type FileDeletedEvent = {
  id: string;
  deletedAt: Date;
};

type FilePurgedEvent = {
  id: string;
  purgedAt: Date;
};

type FileRestoredEvent = {
  id: string;
  updatedAt: Date;
};

type FileMovedEvent = {
  id: string;
  collectionId: string | null;
  updatedAt: Date;
};

export const fileTable = State.SQLite.table({
  name: "files",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    name: State.SQLite.text({ default: "" }),
    type: State.SQLite.text({ default: "document", schema: FileTypeSchema }),
    mimeType: State.SQLite.text({ default: "" }),
    sizeBytes: State.SQLite.integer({ default: 0 }),
    storageType: State.SQLite.text({
      default: "opfs",
      schema: StorageTypeSchema,
    }),
    storagePath: State.SQLite.text({ default: "" }),
    parentId: State.SQLite.text({ nullable: true }),
    positionX: State.SQLite.integer({ nullable: true }),
    positionY: State.SQLite.integer({ nullable: true }),
    transcriptPath: State.SQLite.text({ nullable: true }),
    indexedAt: State.SQLite.integer({
      nullable: true,
      schema: Schema.DateFromNumber,
    }),
    indexStatus: State.SQLite.text({
      default: "pending",
      schema: IndexStatusSchema,
    }),
    indexSummary: State.SQLite.text({ nullable: true }),
    collectionId: State.SQLite.text({ nullable: true }),
    durationSec: State.SQLite.real({ nullable: true }),
    thumbnailPath: State.SQLite.text({ nullable: true }),
    createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    deletedAt: State.SQLite.integer({
      nullable: true,
      schema: Schema.DateFromNumber,
    }),
    purgedAt: State.SQLite.integer({
      nullable: true,
      schema: Schema.DateFromNumber,
    }),
  },
});

export const fileEvents = {
  fileCreated: Events.synced({
    name: "v1.FileCreated",
    schema: Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      type: FileTypeSchema,
      mimeType: Schema.String,
      sizeBytes: Schema.Number,
      storageType: StorageTypeSchema,
      storagePath: Schema.String,
      parentId: Schema.optional(Schema.NullOr(Schema.String)),
      positionX: Schema.optional(Schema.NullOr(Schema.Number)),
      positionY: Schema.optional(Schema.NullOr(Schema.Number)),
      collectionId: Schema.optional(Schema.String),
      durationSec: Schema.optional(Schema.Number),
      createdAt: Schema.Date,
    }),
  }),
  fileUpdated: Events.synced({
    name: "v1.FileUpdated",
    schema: Schema.Struct({
      id: Schema.String,
      name: Schema.optional(Schema.String),
      parentId: Schema.optional(Schema.NullOr(Schema.String)),
      positionX: Schema.optional(Schema.NullOr(Schema.Number)),
      positionY: Schema.optional(Schema.NullOr(Schema.Number)),
      collectionId: Schema.optional(Schema.NullOr(Schema.String)),
      thumbnailPath: Schema.optional(Schema.NullOr(Schema.String)),
      durationSec: Schema.optional(Schema.NullOr(Schema.Number)),
      mimeType: Schema.optional(Schema.String),
      sizeBytes: Schema.optional(Schema.Number),
      storageType: Schema.optional(StorageTypeSchema),
      storagePath: Schema.optional(Schema.String),
      updatedAt: Schema.Date,
    }),
  }),
  fileTranscribed: Events.synced({
    name: "v1.FileTranscribed",
    schema: Schema.Struct({
      id: Schema.String,
      transcriptPath: Schema.String,
      updatedAt: Schema.Date,
    }),
  }),
  fileIndexed: Events.synced({
    name: "v1.FileIndexed",
    schema: Schema.Struct({
      id: Schema.String,
      indexStatus: IndexStatusSchema,
      indexedAt: Schema.optional(Schema.Date),
      indexSummary: Schema.optional(Schema.String),
      updatedAt: Schema.Date,
    }),
  }),
  fileDeleted: Events.synced({
    name: "v1.FileDeleted",
    schema: Schema.Struct({
      id: Schema.String,
      deletedAt: Schema.Date,
    }),
  }),
  filePurged: Events.synced({
    name: "v1.FilePurged",
    schema: Schema.Struct({
      id: Schema.String,
      purgedAt: Schema.Date,
    }),
  }),
  fileRestored: Events.synced({
    name: "v1.FileRestored",
    schema: Schema.Struct({
      id: Schema.String,
      updatedAt: Schema.Date,
    }),
  }),
  fileMoved: Events.synced({
    name: "v1.FileMoved",
    schema: Schema.Struct({
      id: Schema.String,
      collectionId: Schema.NullOr(Schema.String),
      updatedAt: Schema.Date,
    }),
  }),
};

export const fileMaterializers = {
  "v1.FileCreated": (event: FileCreatedEvent) =>
    fileTable.insert({
      id: event.id,
      name: event.name,
      type: event.type,
      mimeType: event.mimeType,
      sizeBytes: event.sizeBytes,
      storageType: event.storageType,
      storagePath: event.storagePath,
      parentId: event.parentId ?? null,
      positionX: event.positionX ?? null,
      positionY: event.positionY ?? null,
      collectionId: event.collectionId ?? null,
      durationSec: event.durationSec ?? null,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    }),
  "v1.FileUpdated": (event: FileUpdatedEvent) =>
    fileTable
      .update({
        ...(event.name !== undefined ? { name: event.name } : {}),
        ...(event.parentId !== undefined
          ? { parentId: event.parentId ?? null }
          : {}),
        ...(event.positionX !== undefined
          ? { positionX: event.positionX ?? null }
          : {}),
        ...(event.positionY !== undefined
          ? { positionY: event.positionY ?? null }
          : {}),
        ...(event.collectionId !== undefined
          ? { collectionId: event.collectionId ?? null }
          : {}),
        ...(event.thumbnailPath !== undefined
          ? { thumbnailPath: event.thumbnailPath ?? null }
          : {}),
        ...(event.durationSec !== undefined
          ? { durationSec: event.durationSec ?? null }
          : {}),
        ...(event.mimeType !== undefined ? { mimeType: event.mimeType } : {}),
        ...(event.sizeBytes !== undefined
          ? { sizeBytes: event.sizeBytes }
          : {}),
        ...(event.storageType !== undefined
          ? { storageType: event.storageType }
          : {}),
        ...(event.storagePath !== undefined
          ? { storagePath: event.storagePath }
          : {}),
        updatedAt: event.updatedAt,
      })
      .where({ id: event.id }),
  "v1.FileTranscribed": (event: FileTranscribedEvent) =>
    fileTable
      .update({
        transcriptPath: event.transcriptPath,
        updatedAt: event.updatedAt,
      })
      .where({ id: event.id }),
  "v1.FileIndexed": (event: FileIndexedEvent) =>
    fileTable
      .update({
        indexStatus: event.indexStatus,
        indexedAt: event.indexedAt ?? null,
        indexSummary: event.indexSummary ?? null,
        updatedAt: event.updatedAt,
      })
      .where({ id: event.id }),
  "v1.FileDeleted": (event: FileDeletedEvent) =>
    fileTable
      .update({
        deletedAt: event.deletedAt,
      })
      .where({ id: event.id }),
  "v1.FilePurged": (event: FilePurgedEvent) =>
    fileTable
      .update({
        purgedAt: event.purgedAt,
      })
      .where({ id: event.id }),
  "v1.FileRestored": (event: FileRestoredEvent) =>
    fileTable
      .update({
        deletedAt: null,
        updatedAt: event.updatedAt,
      })
      .where({ id: event.id }),
  "v1.FileMoved": (event: FileMovedEvent) =>
    fileTable
      .update({
        collectionId: event.collectionId,
        updatedAt: event.updatedAt,
      })
      .where({ id: event.id }),
};

export type file = typeof fileTable.Type;
