import { Events, Schema, State } from "@livestore/livestore";

type FolderCreatedEvent = {
  id: string;
  name: string;
  parentId?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  createdAt: Date;
};

type FolderUpdatedEvent = {
  id: string;
  name?: string;
  parentId?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  updatedAt: Date;
};

type FolderDeletedEvent = {
  id: string;
  deletedAt: Date;
};

type FolderRestoredEvent = {
  id: string;
  updatedAt: Date;
};

type FolderPurgedEvent = {
  id: string;
  purgedAt: Date;
};

export const folderTable = State.SQLite.table({
  name: "folders",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    name: State.SQLite.text({ default: "" }),
    parentId: State.SQLite.text({ nullable: true }),
    positionX: State.SQLite.integer({ nullable: true }),
    positionY: State.SQLite.integer({ nullable: true }),
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

export const folderEvents = {
  folderCreated: Events.synced({
    name: "v1.FolderCreated",
    schema: Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      parentId: Schema.optional(Schema.NullOr(Schema.String)),
      positionX: Schema.optional(Schema.NullOr(Schema.Number)),
      positionY: Schema.optional(Schema.NullOr(Schema.Number)),
      createdAt: Schema.Date,
    }),
  }),
  folderUpdated: Events.synced({
    name: "v1.FolderUpdated",
    schema: Schema.Struct({
      id: Schema.String,
      name: Schema.optional(Schema.String),
      parentId: Schema.optional(Schema.NullOr(Schema.String)),
      positionX: Schema.optional(Schema.NullOr(Schema.Number)),
      positionY: Schema.optional(Schema.NullOr(Schema.Number)),
      updatedAt: Schema.Date,
    }),
  }),
  folderDeleted: Events.synced({
    name: "v1.FolderDeleted",
    schema: Schema.Struct({
      id: Schema.String,
      deletedAt: Schema.Date,
    }),
  }),
  folderRestored: Events.synced({
    name: "v1.FolderRestored",
    schema: Schema.Struct({
      id: Schema.String,
      updatedAt: Schema.Date,
    }),
  }),
  folderPurged: Events.synced({
    name: "v1.FolderPurged",
    schema: Schema.Struct({
      id: Schema.String,
      purgedAt: Schema.Date,
    }),
  }),
};

export const folderMaterializers = {
  "v1.FolderCreated": (event: FolderCreatedEvent) =>
    folderTable.insert({
      id: event.id,
      name: event.name,
      parentId: event.parentId ?? null,
      positionX: event.positionX ?? null,
      positionY: event.positionY ?? null,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    }),
  "v1.FolderUpdated": (event: FolderUpdatedEvent) =>
    folderTable
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
        updatedAt: event.updatedAt,
      })
      .where({ id: event.id }),
  "v1.FolderDeleted": (event: FolderDeletedEvent) =>
    folderTable
      .update({
        deletedAt: event.deletedAt,
      })
      .where({ id: event.id }),
  "v1.FolderRestored": (event: FolderRestoredEvent) =>
    folderTable
      .update({
        deletedAt: null,
        updatedAt: event.updatedAt,
      })
      .where({ id: event.id }),
  "v1.FolderPurged": (event: FolderPurgedEvent) =>
    folderTable
      .update({
        purgedAt: event.purgedAt,
      })
      .where({ id: event.id }),
};

export type folder = typeof folderTable.Type;
