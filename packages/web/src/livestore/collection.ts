import { Events, Schema, State } from "@livestore/livestore";

type CollectionCreatedEvent = {
  id: string;
  name: string;
  parentId?: string;
  color?: string;
  createdAt: Date;
};

type CollectionUpdatedEvent = {
  id: string;
  name?: string;
  parentId?: string | null;
  color?: string | null;
  updatedAt: Date;
};

type CollectionDeletedEvent = {
  id: string;
  deletedAt: Date;
};

type CollectionRestoredEvent = {
  id: string;
  updatedAt: Date;
};

export const collectionTable = State.SQLite.table({
  name: "collections",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    name: State.SQLite.text({ default: "" }),
    parentId: State.SQLite.text({ nullable: true }),
    color: State.SQLite.text({ nullable: true }),
    createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
    deletedAt: State.SQLite.integer({ nullable: true, schema: Schema.DateFromNumber }),
  },
});

export const collectionEvents = {
  collectionCreated: Events.synced({
    name: "v1.CollectionCreated",
    schema: Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      parentId: Schema.optional(Schema.String),
      color: Schema.optional(Schema.String),
      createdAt: Schema.Date,
    }),
  }),
  collectionUpdated: Events.synced({
    name: "v1.CollectionUpdated",
    schema: Schema.Struct({
      id: Schema.String,
      name: Schema.optional(Schema.String),
      parentId: Schema.optional(Schema.NullOr(Schema.String)),
      color: Schema.optional(Schema.NullOr(Schema.String)),
      updatedAt: Schema.Date,
    }),
  }),
  collectionDeleted: Events.synced({
    name: "v1.CollectionDeleted",
    schema: Schema.Struct({
      id: Schema.String,
      deletedAt: Schema.Date,
    }),
  }),
  collectionRestored: Events.synced({
    name: "v1.CollectionRestored",
    schema: Schema.Struct({
      id: Schema.String,
      updatedAt: Schema.Date,
    }),
  }),
};

export const collectionMaterializers = {
  "v1.CollectionCreated": (event: CollectionCreatedEvent) =>
    collectionTable.insert({
      id: event.id,
      name: event.name,
      parentId: event.parentId ?? null,
      color: event.color ?? null,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    }),
  "v1.CollectionUpdated": (event: CollectionUpdatedEvent) =>
    collectionTable
      .update({
        ...(event.name !== undefined ? { name: event.name } : {}),
        ...(event.parentId !== undefined
          ? { parentId: event.parentId ?? null }
          : {}),
        ...(event.color !== undefined ? { color: event.color ?? null } : {}),
        updatedAt: event.updatedAt,
      })
      .where({ id: event.id }),
  "v1.CollectionDeleted": (event: CollectionDeletedEvent) =>
    collectionTable
      .update({
        deletedAt: event.deletedAt,
      })
      .where({ id: event.id }),
  "v1.CollectionRestored": (event: CollectionRestoredEvent) =>
    collectionTable
      .update({
        deletedAt: null,
        updatedAt: event.updatedAt,
      })
      .where({ id: event.id }),
};
